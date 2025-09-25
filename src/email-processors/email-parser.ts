import { EmailData, EmailRule, ExtractedData, ExtractedDataSchema } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('EmailParser');

export class EmailParser {
  /**
   * Parse email content using rule-specific prompts
   * This is where we would integrate with Claude AI to extract structured data
   * For now, we'll implement basic pattern matching
   */
  static async parseEmail(email: EmailData, rule: EmailRule): Promise<ExtractedData> {
    try {
      if (!email || !email.subject) {
        throw new Error('Invalid email data provided');
      }

      logger.debug(`Parsing email "${email.subject}" using rule "${rule.name}"`);
      // Create base extracted data structure
      const extractedData: ExtractedData = {
        emailId: email.id,
        ruleName: rule.name,
        extractedFields: {},
        confidence: 0,
        extractionMethod: 'pattern-matching',
        timestamp: new Date()
      };

      // Apply rule-specific parsing logic
      switch (rule.name) {
        case 'gastos_comunes':
          return this.parseGastosComunes(email, rule, extractedData);

        case 'facturas_servicios':
          return this.parseFacturasServicios(email, rule, extractedData);

        case 'entregas_amazon':
          return this.parseEntregasAmazon(email, rule, extractedData);

        default:
          return this.parseGeneric(email, rule, extractedData);
      }
    } catch (error) {
      logger.error(`Failed to parse email ${email?.id || 'unknown'} with rule ${rule?.name || 'unknown'}:`, error);
      throw new Error(`Email parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse "gastos comunes" (building fees) emails
   */
  private static parseGastosComunes(
    email: EmailData,
    rule: EmailRule,
    baseData: ExtractedData
  ): ExtractedData {
    const content = `${email.subject} ${email.body}`.toLowerCase();

    // Extract amount (Chilean pesos)
    const montoRegex = /(?:\$|pesos?|clp)\s*(\d{1,3}(?:\.\d{3})*)/i;
    const montoMatch = content.match(montoRegex);
    const monto = montoMatch ? montoMatch[1].replace(/\./g, '') : null;

    // Extract due date - handle both numeric and Spanish month names
    let vencimiento = null;

    // Try Spanish month names first
    const fechaSpanishRegex = /(?:vence|hasta|límite|plazo)[^\d]*(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*de?\s*(\d{2,4})/i;
    const fechaSpanishMatch = content.match(fechaSpanishRegex);

    if (fechaSpanishMatch) {
      const day = fechaSpanishMatch[1];
      const monthName = fechaSpanishMatch[2].toLowerCase();
      const year = fechaSpanishMatch[3].length === 2 ? '20' + fechaSpanishMatch[3] : fechaSpanishMatch[3];

      const monthMap: {[key: string]: string} = {
        enero: '01', febrero: '02', marzo: '03', abril: '04',
        mayo: '05', junio: '06', julio: '07', agosto: '08',
        septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
      };

      const month = monthMap[monthName];
      if (month) {
        vencimiento = `${year}-${month}-${day.padStart(2, '0')}`;
      }
    } else {
      // Try numeric format
      const fechaNumericRegex = /(?:vence|hasta|límite|plazo)[^\d]*(\d{1,2})[^\d]*(\d{1,2})[^\d]*(\d{2,4})/i;
      const fechaNumericMatch = content.match(fechaNumericRegex);

      if (fechaNumericMatch) {
        const day = fechaNumericMatch[1];
        const month = fechaNumericMatch[2];
        const year = fechaNumericMatch[3].length === 2 ? '20' + fechaNumericMatch[3] : fechaNumericMatch[3];
        vencimiento = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    // Extract period (month)
    const periodoRegex = /(?:mes|período|periodo)\s*(?:de\s*)?(\w+)|(\w+)\s*(?:de\s*)?(\d{4})/i;
    const periodoMatch = content.match(periodoRegex);
    const periodo = periodoMatch ? (periodoMatch[1] || periodoMatch[2]) : null;

    const extractedFields = {
      monto,
      vencimiento,
      periodo,
      tipo: 'gastos_comunes'
    };

    // Calculate confidence based on how many fields we extracted
    const fieldsExtracted = Object.values(extractedFields).filter(v => v !== null).length;
    const confidence = Math.round((fieldsExtracted / 4) * 100);

    logger.debug(`Extracted gastos comunes data:`, extractedFields);

    return ExtractedDataSchema.parse({
      ...baseData,
      extractedFields,
      confidence,
      extractionMethod: 'regex-pattern'
    });
  }

  /**
   * Parse "facturas servicios" (utility bills) emails
   */
  private static parseFacturasServicios(
    email: EmailData,
    rule: EmailRule,
    baseData: ExtractedData
  ): ExtractedData {
    const content = `${email.subject} ${email.body}`.toLowerCase();

    // Extract company name from sender or content
    let empresa = null;
    if (email.from.includes('enel')) {
      empresa = 'Enel';
    } else if (email.from.includes('movistar')) {
      empresa = 'Movistar';
    } else {
      // Try to extract from content
      const empresaRegex = /(enel|movistar|vtr|entel|claro)/i;
      const empresaMatch = content.match(empresaRegex);
      empresa = empresaMatch ? empresaMatch[1] : null;
    }

    // Extract amount
    const montoRegex = /(?:total|pagar|factura|monto)[^\d]*\$?\s*(\d{1,3}(?:\.\d{3})*)/i;
    const montoMatch = content.match(montoRegex);
    const monto = montoMatch ? montoMatch[1].replace(/\./g, '') : null;

    // Extract due date - handle both numeric and Spanish month names
    let vencimiento = null;

    // Try Spanish month names first
    const vencimientoSpanishRegex = /(?:vence|vencimiento|hasta)[^\d]*(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*de?\s*(\d{2,4})/i;
    const vencimientoSpanishMatch = content.match(vencimientoSpanishRegex);

    if (vencimientoSpanishMatch) {
      const day = vencimientoSpanishMatch[1];
      const monthName = vencimientoSpanishMatch[2].toLowerCase();
      const year = vencimientoSpanishMatch[3].length === 2 ? '20' + vencimientoSpanishMatch[3] : vencimientoSpanishMatch[3];

      const monthMap: {[key: string]: string} = {
        enero: '01', febrero: '02', marzo: '03', abril: '04',
        mayo: '05', junio: '06', julio: '07', agosto: '08',
        septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
      };

      const month = monthMap[monthName];
      if (month) {
        vencimiento = `${year}-${month}-${day.padStart(2, '0')}`;
      }
    } else {
      // Try numeric format
      const vencimientoNumericRegex = /(?:vence|vencimiento|hasta)[^\d]*(\d{1,2})[^\d]*(\d{1,2})[^\d]*(\d{2,4})/i;
      const vencimientoNumericMatch = content.match(vencimientoNumericRegex);

      if (vencimientoNumericMatch) {
        const day = vencimientoNumericMatch[1];
        const month = vencimientoNumericMatch[2];
        const year = vencimientoNumericMatch[3].length === 2 ? '20' + vencimientoNumericMatch[3] : vencimientoNumericMatch[3];
        vencimiento = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    const extractedFields = {
      empresa,
      monto,
      vencimiento,
      tipo: 'factura_servicios'
    };

    const fieldsExtracted = Object.values(extractedFields).filter(v => v !== null).length;
    const confidence = Math.round((fieldsExtracted / 4) * 100);

    logger.debug(`Extracted facturas servicios data:`, extractedFields);

    return ExtractedDataSchema.parse({
      ...baseData,
      extractedFields,
      confidence,
      extractionMethod: 'regex-pattern'
    });
  }

  /**
   * Parse Amazon delivery emails
   */
  private static parseEntregasAmazon(
    email: EmailData,
    rule: EmailRule,
    baseData: ExtractedData
  ): ExtractedData {
    const content = `${email.subject} ${email.body}`.toLowerCase();

    // Extract tracking number
    const trackingRegex = /(?:tracking|seguimiento|rastreo)[:\s]*([a-z0-9]{8,})/i;
    const trackingMatch = content.match(trackingRegex);
    const tracking = trackingMatch ? trackingMatch[1].toUpperCase() : null;

    // Extract delivery date - handle both numeric and Spanish month names
    let fechaEntrega = null;

    // Try Spanish month names first - with optional year
    const fechaEntregaSpanishRegex = /(?:entrega|llegará|delivery).*?(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*(?:de|del?)?\s*(\d{2,4}))?/i;
    const fechaEntregaSpanishMatch = content.match(fechaEntregaSpanishRegex);

    if (fechaEntregaSpanishMatch) {
      const day = fechaEntregaSpanishMatch[1];
      const monthName = fechaEntregaSpanishMatch[2].toLowerCase();
      // Default to current year if not provided
      let year = fechaEntregaSpanishMatch[3] || new Date().getFullYear().toString();
      if (year.length === 2) {
        year = '20' + year;
      }

      const monthMap: {[key: string]: string} = {
        enero: '01', febrero: '02', marzo: '03', abril: '04',
        mayo: '05', junio: '06', julio: '07', agosto: '08',
        septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
      };

      const month = monthMap[monthName];
      if (month) {
        fechaEntrega = `${year}-${month}-${day.padStart(2, '0')}`;
      }
    } else {
      // Try numeric format
      const fechaEntregaNumericRegex = /(?:entrega|llegará|delivery)[^\d]*(\d{1,2})[^\d]*(\d{1,2})[^\d]*(\d{2,4})/i;
      const fechaEntregaNumericMatch = content.match(fechaEntregaNumericRegex);

      if (fechaEntregaNumericMatch) {
        const day = fechaEntregaNumericMatch[1];
        const month = fechaEntregaNumericMatch[2];
        const year = fechaEntregaNumericMatch[3].length === 2 ? '20' + fechaEntregaNumericMatch[3] : fechaEntregaNumericMatch[3];
        fechaEntrega = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    // Extract product name (simple extraction)
    const productoRegex = /(?:producto|artículo|item)[^\n]*([^\n]{10,50})/i;
    const productoMatch = content.match(productoRegex);
    const producto = productoMatch ? productoMatch[1].trim() : null;

    const extractedFields = {
      tracking,
      fechaEntrega,
      producto,
      proveedor: 'Amazon',
      tipo: 'entrega'
    };

    const fieldsExtracted = Object.values(extractedFields).filter(v => v !== null).length;
    const confidence = Math.round((fieldsExtracted / 5) * 100);

    logger.debug(`Extracted entregas Amazon data:`, extractedFields);

    return ExtractedDataSchema.parse({
      ...baseData,
      extractedFields,
      confidence,
      extractionMethod: 'regex-pattern'
    });
  }

  /**
   * Generic parsing for rules without specific logic
   */
  private static parseGeneric(
    email: EmailData,
    rule: EmailRule,
    baseData: ExtractedData
  ): ExtractedData {
    logger.debug(`Using generic parsing for rule "${rule.name}"`);

    // Basic extraction of common patterns
    const content = `${email.subject} ${email.body}`;

    // Extract any monetary amounts
    const moneyRegex = /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
    const amounts = [];
    let match;
    while ((match = moneyRegex.exec(content)) !== null) {
      amounts.push(match[1]);
    }

    // Extract dates
    const dateRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g;
    const dates = [];
    while ((match = dateRegex.exec(content)) !== null) {
      dates.push(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`);
    }

    const extractedFields = {
      amounts: amounts.length > 0 ? amounts : null,
      dates: dates.length > 0 ? dates : null,
      sender: email.from,
      subject: email.subject,
      tipo: 'generic'
    };

    const fieldsExtracted = Object.values(extractedFields).filter(v => v !== null).length;
    const confidence = fieldsExtracted > 0 ? 50 : 0; // Lower confidence for generic parsing

    return ExtractedDataSchema.parse({
      ...baseData,
      extractedFields,
      confidence,
      extractionMethod: 'generic-pattern'
    });
  }

  /**
   * Parse multiple emails with their matched rules
   */
  static async parseEmails(emails: EmailData[]): Promise<ExtractedData[]> {
    logger.info(`Parsing ${emails.length} emails`);

    const results: ExtractedData[] = [];

    for (const email of emails) {
      if (email.matchedRules.length === 0) {
        logger.debug(`Skipping email "${email.subject}" - no matched rules`);
        continue;
      }

      // For now, use the first matched rule
      // In the future, we could parse with all rules and combine results
      const ruleName = email.matchedRules[0];

      try {
        // We need the actual rule object, but for now we'll create a minimal one
        // In practice, this would come from the rule loader
        const mockRule: EmailRule = {
          name: ruleName,
          status: 'active',
          providers: ['gmail', 'icloud'],
          prompt: '',
          reminderTemplate: {
            titleTemplate: '',
            listName: 'Facturas',
            priority: 'normal',
            daysBeforeReminder: 3,
            timeOfDay: '09:00'
          }
        };

        const extractedData = await this.parseEmail(email, mockRule);
        results.push(extractedData);

        logger.debug(`Successfully parsed email "${email.subject}" with rule "${ruleName}"`);
      } catch (error) {
        logger.error(`Failed to parse email "${email.subject}" with rule "${ruleName}":`, error);

        // Create a basic extracted data for failed parsing
        const basicExtractedData = {
          emailId: email.id,
          ruleName: ruleName,
          extractedFields: {
            tipo: ruleName.replace(/_/g, '_'),
            error: 'parsing_failed'
          },
          confidence: 0,
          extractionMethod: 'error-fallback',
          timestamp: new Date()
        };

        try {
          const validatedData = ExtractedDataSchema.parse(basicExtractedData);
          results.push(validatedData);
        } catch (validationError) {
          logger.error('Failed to create fallback extracted data:', validationError);
        }
      }
    }

    logger.info(`Successfully parsed ${results.length}/${emails.length} emails`);
    return results;
  }

  /**
   * Get parsing statistics
   */
  static getParsingStats(extractedDataList: ExtractedData[]): {
    totalParsed: number;
    averageConfidence: number;
    byMethod: Record<string, number>;
    byRule: Record<string, number>;
    highConfidence: number;
    lowConfidence: number;
  } {
    const totalParsed = extractedDataList.length;

    const averageConfidence = totalParsed > 0
      ? extractedDataList.reduce((sum, data) => sum + data.confidence, 0) / totalParsed
      : 0;

    const byMethod: Record<string, number> = {};
    const byRule: Record<string, number> = {};

    let highConfidence = 0;
    let lowConfidence = 0;

    extractedDataList.forEach(data => {
      // Count by method
      byMethod[data.extractionMethod] = (byMethod[data.extractionMethod] || 0) + 1;

      // Count by rule
      byRule[data.ruleName] = (byRule[data.ruleName] || 0) + 1;

      // Count confidence levels
      if (data.confidence >= 80) {
        highConfidence++;
      } else if (data.confidence < 50) {
        lowConfidence++;
      }
    });

    return {
      totalParsed,
      averageConfidence: Math.round(averageConfidence),
      byMethod,
      byRule,
      highConfidence,
      lowConfidence
    };
  }
}