import { EmailData, EmailRule, ExtractedData, ProcessingResult } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('claude-processor');

export interface ClaudeConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface PromptTemplate {
  system: string;
  user: string;
  variables: string[];
}

export class ClaudeProcessor {
  private config: ClaudeConfig;
  private promptTemplates: Map<string, PromptTemplate>;

  constructor(config: ClaudeConfig = {}) {
    this.config = {
      model: 'claude-3-sonnet-20240229',
      maxTokens: 1000,
      temperature: 0.1,
      ...config
    };
    this.promptTemplates = new Map();
    this.initializeDefaultTemplates();
  }

  private initializeDefaultTemplates(): void {
    // Default template for gastos comunes (building fees)
    this.promptTemplates.set('gastos_comunes', {
      system: `Eres un experto en análisis de emails sobre gastos comunes de edificios en Chile.
Extrae información estructurada de emails sobre gastos comunes.
SIEMPRE responde en formato JSON válido.`,
      user: `Analiza este email y extrae:
- monto: cantidad en pesos chilenos (solo números, sin puntos ni comas)
- vencimiento: fecha límite en formato YYYY-MM-DD
- periodo: mes y año del gasto común
- tipo: "gastos_comunes"
- edificio: nombre del edificio si está disponible

Email:
From: {{from}}
Subject: {{subject}}
Body: {{body}}

Responde SOLO con JSON válido:`,
      variables: ['from', 'subject', 'body']
    });

    // Default template for utility bills
    this.promptTemplates.set('facturas_servicios', {
      system: `Eres un experto en análisis de facturas de servicios básicos en Chile.
Extrae información estructurada de facturas de electricidad, agua, gas, etc.
SIEMPRE responde en formato JSON válido.`,
      user: `Analiza esta factura y extrae:
- empresa: nombre de la empresa de servicio
- monto: cantidad en pesos chilenos (solo números)
- vencimiento: fecha límite en formato YYYY-MM-DD
- tipo: "factura_servicios"
- servicio: tipo de servicio (electricidad, agua, gas, etc.)

Email:
From: {{from}}
Subject: {{subject}}
Body: {{body}}

Responde SOLO con JSON válido:`,
      variables: ['from', 'subject', 'body']
    });

    // Default template for Amazon deliveries
    this.promptTemplates.set('entregas_amazon', {
      system: `Eres un experto en análisis de emails de entrega de Amazon.
Extrae información sobre paquetes y fechas de entrega.
SIEMPRE responde en formato JSON válido.`,
      user: `Analiza este email de entrega y extrae:
- tracking: número de seguimiento si está disponible
- fechaEntrega: fecha estimada de entrega en formato YYYY-MM-DD
- proveedor: "Amazon"
- tipo: "entrega"
- producto: descripción del producto si está disponible

Email:
From: {{from}}
Subject: {{subject}}
Body: {{body}}

Responde SOLO con JSON válido:`,
      variables: ['from', 'subject', 'body']
    });

    // Generic template for unknown rules
    this.promptTemplates.set('generic', {
      system: `Eres un asistente que extrae información útil de emails.
Identifica fechas importantes, montos y información relevante.
SIEMPRE responde en formato JSON válido.`,
      user: `Analiza este email y extrae información relevante:
- fechaImportante: cualquier fecha importante en formato YYYY-MM-DD
- monto: cualquier cantidad monetaria (solo números)
- tipo: "generic"
- resumen: breve resumen del contenido

Email:
From: {{from}}
Subject: {{subject}}
Body: {{body}}

Responde SOLO con JSON válido:`,
      variables: ['from', 'subject', 'body']
    });
  }

  public setPromptTemplate(ruleName: string, template: PromptTemplate): void {
    this.promptTemplates.set(ruleName, template);
    logger.info(`Updated prompt template for rule: ${ruleName}`);
  }

  public getPromptTemplate(ruleName: string): PromptTemplate | undefined {
    return this.promptTemplates.get(ruleName) || this.promptTemplates.get('generic');
  }

  private substituteVariables(template: string, variables: Record<string, string>): string {
    let result = template;

    // Replace all template variables with their values
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value || '');
    }

    // Replace any remaining placeholders with empty strings
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }

  private buildPrompt(email: EmailData, rule: EmailRule): { system: string; user: string } {
    const template = this.getPromptTemplate(rule.name);

    if (!template) {
      logger.warn(`No template found for rule: ${rule.name}, using generic`);
      return this.buildGenericPrompt(email);
    }

    const variables = {
      from: email.from,
      subject: email.subject,
      body: email.body,
      date: email.date.toISOString(),
      provider: email.provider
    };

    return {
      system: this.substituteVariables(template.system, variables),
      user: this.substituteVariables(template.user, variables)
    };
  }

  private buildGenericPrompt(email: EmailData): { system: string; user: string } {
    const template = this.promptTemplates.get('generic')!;

    const variables = {
      from: email.from,
      subject: email.subject,
      body: email.body,
      date: email.date.toISOString(),
      provider: email.provider
    };

    return {
      system: this.substituteVariables(template.system, variables),
      user: this.substituteVariables(template.user, variables)
    };
  }

  public async processEmail(email: EmailData, rule: EmailRule): Promise<ProcessingResult> {
    const startTime = Date.now();
    logger.info(`Processing email ${email.id} with rule ${rule.name}`);

    try {
      const prompts = this.buildPrompt(email, rule);

      // In this implementation, we'll use a mock Claude response
      // In production, this would call the actual Claude API
      const claudeResponse = await this.mockClaudeCall(prompts, email, rule);

      const processingTime = Date.now() - startTime;

      const result: ProcessingResult = {
        emailId: email.id,
        ruleName: rule.name,
        extractedFields: claudeResponse,
        confidence: this.calculateConfidence(claudeResponse, rule),
        extractionMethod: 'ai-claude',
        processingTime,
        timestamp: new Date()
      };

      logger.info(`Successfully processed email ${email.id} in ${processingTime}ms`);
      return result;

    } catch (error) {
      logger.error(`Failed to process email ${email.id}:`, error);

      return {
        emailId: email.id,
        ruleName: rule.name,
        extractedFields: this.createFallbackExtraction(email, rule),
        confidence: 0,
        extractionMethod: 'ai-claude-fallback',
        processingTime: Date.now() - startTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async mockClaudeCall(
    prompts: { system: string; user: string },
    email: EmailData,
    rule: EmailRule
  ): Promise<ExtractedData> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

    logger.debug(`Claude prompt for ${rule.name}:`, {
      system: prompts.system.substring(0, 100) + '...',
      user: prompts.user.substring(0, 100) + '...'
    });

    // Mock responses based on rule type
    switch (rule.name) {
      case 'gastos_comunes':
        return this.mockGastosComunesResponse(email);

      case 'facturas_servicios':
        return this.mockFacturasResponse(email);

      case 'entregas_amazon':
        return this.mockAmazonResponse(email);

      default:
        return this.mockGenericResponse(email);
    }
  }

  private mockGastosComunesResponse(email: EmailData): ExtractedData {
    // Extract amount using regex - look for currency patterns
    const amountMatch = email.body.match(/\$\s*([\d,\.]+)(?:\s*pesos)?/i) ||
                       email.body.match(/([\d,\.]+)\s*pesos/i);
    const amount = amountMatch ? amountMatch[1].replace(/[,\.]/g, '') : null;

    // Extract due date - look for various date patterns
    let dueDate = null;
    const dateMatch = email.body.match(/(\d{1,2})\s+de\s+(\w+)\s+de?\s+(\d{4})/i) ||
                     email.body.match(/vence\s+el\s+(\d{1,2})\s+de\s+(\w+)\s+de?\s+(\d{4})/i);

    if (dateMatch) {
      const months: Record<string, string> = {
        enero: '01', febrero: '02', marzo: '03', abril: '04',
        mayo: '05', junio: '06', julio: '07', agosto: '08',
        septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
      };
      const month = months[dateMatch[2].toLowerCase()];
      if (month) {
        dueDate = `${dateMatch[3]}-${month}-${dateMatch[1].padStart(2, '0')}`;
      }
    }

    // Extract period from subject or body
    let period = null;
    const periodMatch = email.subject.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(\d{4})?/i) ||
                       email.body.match(/del\s+mes\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i);

    if (periodMatch) {
      period = periodMatch[1].toLowerCase();
    }

    return {
      monto: amount,
      vencimiento: dueDate,
      periodo: period,
      tipo: 'gastos_comunes',
      edificio: null
    };
  }

  private mockFacturasResponse(email: EmailData): ExtractedData {
    // Extract company from email domain
    const domainMatch = email.from.match(/@(.+)\.cl$/);
    let empresa = null;
    if (domainMatch) {
      empresa = domainMatch[1].charAt(0).toUpperCase() + domainMatch[1].slice(1);
    }

    // Extract amount
    const amountMatch = email.body.match(/\$?([\d,\.]+)(?:\s*pesos)?/i);
    const amount = amountMatch ? amountMatch[1].replace(/[,\.]/g, '') : null;

    // Extract due date
    const dateMatch = email.body.match(/(\d{1,2})\s+de\s+(\w+)\s+de?\s+(\d{4})/i);
    let dueDate = null;

    if (dateMatch) {
      const months: Record<string, string> = {
        enero: '01', febrero: '02', marzo: '03', abril: '04',
        mayo: '05', junio: '06', julio: '07', agosto: '08',
        septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
      };
      const month = months[dateMatch[2].toLowerCase()];
      if (month) {
        dueDate = `${dateMatch[3]}-${month}-${dateMatch[1].padStart(2, '0')}`;
      }
    }

    return {
      empresa,
      monto: amount,
      vencimiento: dueDate,
      tipo: 'factura_servicios',
      servicio: 'electricidad'
    };
  }

  private mockAmazonResponse(email: EmailData): ExtractedData {
    // Extract tracking number
    const trackingMatch = email.body.match(/TRK[A-Z0-9]+|[A-Z]{3}[0-9]{9}[A-Z0-9]*/);
    const tracking = trackingMatch ? trackingMatch[0] : null;

    // Extract delivery date
    const dateMatch = email.body.match(/(\d{1,2})\s+de\s+(\w+)/i);
    let fechaEntrega = null;

    if (dateMatch) {
      const months: Record<string, string> = {
        enero: '01', febrero: '02', marzo: '03', abril: '04',
        mayo: '05', junio: '06', julio: '07', agosto: '08',
        septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
      };
      const month = months[dateMatch[2].toLowerCase()];
      if (month) {
        fechaEntrega = `2025-${month}-${dateMatch[1].padStart(2, '0')}`;
      }
    }

    return {
      tracking,
      fechaEntrega,
      proveedor: 'Amazon',
      tipo: 'entrega',
      producto: null
    };
  }

  private mockGenericResponse(email: EmailData): ExtractedData {
    return {
      tipo: 'generic',
      sender: email.from,
      subject: email.subject,
      fechaImportante: null,
      monto: null,
      resumen: email.subject
    };
  }

  private calculateConfidence(data: ExtractedData, rule: EmailRule): number {
    let score = 0;
    let totalFields = 0;

    // Define required fields by rule type
    const ruleRequirements: Record<string, string[]> = {
      'gastos_comunes': ['monto', 'vencimiento', 'periodo', 'tipo'],
      'facturas_servicios': ['empresa', 'monto', 'vencimiento', 'tipo'],
      'entregas_amazon': ['tracking', 'fechaEntrega', 'proveedor', 'tipo'],
      'generic': ['tipo']
    };

    const requiredFields = ruleRequirements[rule.name] || ruleRequirements['generic'];

    // Base confidence on presence of required fields
    for (const field of requiredFields) {
      totalFields++;
      if (data[field] !== null && data[field] !== undefined && data[field] !== '') {
        score++;
      }
    }

    // Calculate base percentage
    let confidence = totalFields > 0 ? Math.round((score / totalFields) * 100) : 0;

    // Apply bonuses for high-quality extractions
    if (confidence >= 75) {
      // Bonus for complete extraction
      switch (rule.name) {
        case 'gastos_comunes':
          if (data.monto && data.vencimiento && data.periodo) {
            confidence = Math.min(100, confidence + 10);
          }
          break;
        case 'facturas_servicios':
          if (data.empresa && data.monto && data.vencimiento) {
            confidence = Math.min(100, confidence + 10);
          }
          break;
        case 'entregas_amazon':
          if (data.tracking && data.fechaEntrega) {
            confidence = Math.min(100, confidence + 10);
          }
          break;
      }
    }

    return confidence;
  }

  private createFallbackExtraction(email: EmailData, rule: EmailRule): ExtractedData {
    return {
      tipo: rule.name,
      sender: email.from,
      subject: email.subject,
      error: 'AI processing failed, using fallback extraction'
    };
  }

  public async processMultipleEmails(
    emails: EmailData[],
    rules: EmailRule[]
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    for (const email of emails) {
      if (!email.matchedRules || email.matchedRules.length === 0) {
        continue;
      }

      for (const ruleName of email.matchedRules) {
        const rule = rules.find(r => r.name === ruleName);
        if (!rule) {
          logger.warn(`Rule not found: ${ruleName}`);
          continue;
        }

        try {
          const result = await this.processEmail(email, rule);
          results.push(result);
        } catch (error) {
          logger.error(`Failed to process email ${email.id} with rule ${ruleName}:`, error);
        }
      }
    }

    return results;
  }

  public getProcessingStats(results: ProcessingResult[]): {
    total: number;
    successful: number;
    failed: number;
    averageConfidence: number;
    averageProcessingTime: number;
    byRule: Record<string, number>;
  } {
    const stats = {
      total: results.length,
      successful: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
      averageConfidence: 0,
      averageProcessingTime: 0,
      byRule: {} as Record<string, number>
    };

    if (results.length === 0) {
      return stats;
    }

    stats.averageConfidence = Math.round(
      results.reduce((sum, r) => sum + r.confidence, 0) / results.length
    );

    stats.averageProcessingTime = Math.round(
      results.reduce((sum, r) => sum + (r.processingTime || 0), 0) / results.length
    );

    // Count by rule
    for (const result of results) {
      stats.byRule[result.ruleName] = (stats.byRule[result.ruleName] || 0) + 1;
    }

    return stats;
  }
}