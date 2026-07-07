const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Helper to find a value in a row using keywords.
 */
function findValue(row, keywords) {
  for (const key of Object.keys(row)) {
    const normKey = key.toLowerCase().replace(/[\s_-]/g, '');
    if (keywords.some(kw => normKey.includes(kw))) {
      return row[key];
    }
  }
  return '';
}

/**
 * Parses and splits phone numbers into country code and mobile number.
 */
function parsePhoneNumber(phoneStr) {
  if (!phoneStr) return { countryCode: '', mobile: '' };
  
  // Clean phone number: remove spaces, dashes, parentheses
  const cleaned = phoneStr.replace(/[^\d+]/g, '');
  
  if (cleaned.startsWith('+')) {
    if (cleaned.startsWith('+91')) {
      return { countryCode: '+91', mobile: cleaned.slice(3) };
    } else if (cleaned.startsWith('+1')) {
      return { countryCode: '+1', mobile: cleaned.slice(2) };
    } else {
      // General match: try to split +<1-4 digits> followed by <7-10 digits>
      const match = cleaned.match(/^(\+\d{1,3})(\d{10})$/) || cleaned.match(/^(\+\d{1,4})(\d{7,10})$/);
      if (match) {
        return { countryCode: match[1], mobile: match[2] };
      }
      return { countryCode: '', mobile: cleaned };
    }
  } else {
    // If it starts with 91 and is 12 digits long
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return { countryCode: '+91', mobile: cleaned.slice(2) };
    }
    // If it's a 10 digit number, default to +91 (India)
    if (cleaned.length === 10) {
      return { countryCode: '+91', mobile: cleaned };
    }
    return { countryCode: '', mobile: cleaned };
  }
}

/**
 * Maps a single row using smart heuristic rules.
 */
function mapRowHeuristics(row) {
  // 1. Identify Emails
  let rawEmails = findValue(row, ['email', 'mail', 'emailaddress']);
  // If not found in columns, scan all values in row for email patterns
  if (!rawEmails) {
    for (const val of Object.values(row)) {
      if (typeof val === 'string' && val.includes('@')) {
        const matches = val.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
        if (matches) {
          rawEmails = matches.join(',');
          break;
        }
      }
    }
  }

  const emails = rawEmails ? rawEmails.split(/[,\s;/]+/).map(e => e.trim()).filter(Boolean) : [];
  const primaryEmail = emails[0] || '';
  const extraEmails = emails.slice(1);

  // 2. Identify Phones
  let rawPhones = findValue(row, ['phone', 'mobile', 'contact', 'number', 'tel', 'cell']);
  if (!rawPhones) {
    for (const val of Object.values(row)) {
      if (typeof val === 'string' && val.replace(/[^\d+]/g, '').length >= 10) {
        // simple heuristic: string with 10+ digits
        rawPhones = val;
        break;
      }
    }
  }
  const phones = rawPhones ? rawPhones.split(/[,\n\r;/\\\|]+/).map(p => p.trim()).filter(Boolean) : [];
  const primaryPhoneParsed = parsePhoneNumber(phones[0]);
  const extraPhones = phones.slice(1);

  // 3. Skip check
  if (!primaryEmail && !primaryPhoneParsed.mobile) {
    return {
      status: 'skipped',
      skip_reason: 'Record lacks both email and mobile number',
      data: null
    };
  }

  // 4. Extract Name
  let name = '';
  const firstName = findValue(row, ['firstname', 'fname']);
  const lastName = findValue(row, ['lastname', 'lname']);
  if (firstName || lastName) {
    name = `${firstName} ${lastName}`.trim();
  } else {
    name = findValue(row, ['name', 'leadname', 'client', 'customer']);
  }

  // 5. Created At
  const dateStr = findValue(row, ['createdat', 'creation', 'date', 'time', 'timestamp']);
  let createdAt = '';
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      createdAt = d.toISOString().replace('T', ' ').substring(0, 19);
    }
  }
  if (!createdAt) {
    createdAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  }

  // 6. CRM Status
  const statusStr = findValue(row, ['status', 'stage', 'leadstatus']).toUpperCase();
  let crmStatus = 'GOOD_LEAD_FOLLOW_UP'; // default
  if (statusStr.includes('FOLLOW') || statusStr.includes('GOOD')) {
    crmStatus = 'GOOD_LEAD_FOLLOW_UP';
  } else if (statusStr.includes('CONNECT') || statusStr.includes('BUSY') || statusStr.includes('ANSWER') || statusStr.includes('DIAL') || statusStr.includes('CALL')) {
    crmStatus = 'DID_NOT_CONNECT';
  } else if (statusStr.includes('BAD') || statusStr.includes('JUNK') || statusStr.includes('NOT INTER') || statusStr.includes('FAKE')) {
    crmStatus = 'BAD_LEAD';
  } else if (statusStr.includes('DONE') || statusStr.includes('SALE') || statusStr.includes('WON') || statusStr.includes('CLOSE')) {
    crmStatus = 'SALE_DONE';
  }

  // 7. Data Source
  const srcStr = findValue(row, ['source', 'campaign', 'datasource', 'utm']).toLowerCase();
  let dataSource = '';
  const allowedSources = ['leads_on_demand', 'meridian_tower', 'eden_park', 'varah_swamy', 'sarjapur_plots'];
  for (const src of allowedSources) {
    if (srcStr.includes(src.replace('_', '')) || srcStr.includes(src)) {
      dataSource = src;
      break;
    }
  }

  // 8. Notes and Remarks
  const remarks = findValue(row, ['note', 'remark', 'comment', 'feedback']);
  let crmNote = remarks || '';
  if (extraEmails.length > 0) {
    crmNote += (crmNote ? ' | ' : '') + `Alt Emails: ${extraEmails.join(', ')}`;
  }
  if (extraPhones.length > 0) {
    crmNote += (crmNote ? ' | ' : '') + `Alt Phones: ${extraPhones.join(', ')}`;
  }

  // Escape line breaks for CSV safety
  const cleanNote = crmNote.replace(/\r?\n/g, '\\n');
  const cleanDesc = findValue(row, ['description', 'desc', 'details', 'about']).replace(/\r?\n/g, '\\n');

  return {
    status: 'success',
    data: {
      created_at: createdAt,
      name: name || 'Unknown',
      email: primaryEmail,
      country_code: primaryPhoneParsed.countryCode || '+91',
      mobile_without_country_code: primaryPhoneParsed.mobile,
      company: findValue(row, ['company', 'org', 'business', 'employer']) || '',
      city: findValue(row, ['city', 'town', 'location']) || '',
      state: findValue(row, ['state', 'region', 'province']) || '',
      country: findValue(row, ['country', 'nation']) || '',
      lead_owner: findValue(row, ['owner', 'agent', 'assigned']) || '',
      crm_status: crmStatus,
      crm_note: cleanNote,
      data_source: dataSource,
      possession_time: findValue(row, ['possession', 'possessiontime', 'timeframe']) || '',
      description: cleanDesc
    }
  };
}

/**
 * Extracts and maps a batch of CSV rows into GrowEasy CRM format using Gemini API.
 * Falls back to heuristics if the API key is not present.
 * 
 * @param {Array<Object>} rows - Batch of CSV row objects
 * @param {string} apiKey - Gemini API Key (optional)
 * @returns {Promise<Array<Object>>} List of mapped CRM records
 */
async function extractBatch(rows, apiKey) {
  if (!apiKey) {
    // Run fallback heuristics
    return rows.map(mapRowHeuristics);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-1.5-flash as it is highly efficient and supports JSON schema output
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            mappedRecords: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  status: { type: "STRING", enum: ["success", "skipped"] },
                  skip_reason: { type: "STRING" },
                  created_at: { type: "STRING" },
                  name: { type: "STRING" },
                  email: { type: "STRING" },
                  country_code: { type: "STRING" },
                  mobile_without_country_code: { type: "STRING" },
                  company: { type: "STRING" },
                  city: { type: "STRING" },
                  state: { type: "STRING" },
                  country: { type: "STRING" },
                  lead_owner: { type: "STRING" },
                  crm_status: { type: "STRING", enum: ["GOOD_LEAD_FOLLOW_UP", "DID_NOT_CONNECT", "BAD_LEAD", "SALE_DONE"] },
                  crm_note: { type: "STRING" },
                  data_source: { type: "STRING", enum: ["leads_on_demand", "meridian_tower", "eden_park", "varah_swamy", "sarjapur_plots", ""] },
                  possession_time: { type: "STRING" },
                  description: { type: "STRING" }
                },
                required: ["status"]
              }
            }
          },
          required: ["mappedRecords"]
        }
      }
    });

    const systemInstruction = `
You are an expert AI data mapping assistant for GrowEasy CRM.
Your task is to take a batch of raw records from an uploaded CSV and intelligently map each one to the standard GrowEasy CRM format.

Here are the strict extraction and mapping rules:
1. CRM Status: Must be exactly one of: GOOD_LEAD_FOLLOW_UP, DID_NOT_CONNECT, BAD_LEAD, SALE_DONE. Map values like 'follow up', 'connected', 'not interested', 'sold', 'closed' intelligently to these statuses.
2. Data Source: Must be exactly one of: leads_on_demand, meridian_tower, eden_park, varah_swamy, sarjapur_plots. If none match confidently, leave it empty.
3. Date Format: 'created_at' must be a date string that is convertible using JavaScript 'new Date(created_at)'. E.g. "YYYY-MM-DD HH:mm:ss". If not specified or invalid, default to the current timestamp.
4. Emails & Mobile Numbers:
   - If multiple email addresses are present (e.g. separated by commas/semicolons), use the first email for 'email' and append the remaining emails to 'crm_note'.
   - If multiple mobile numbers are present, use the first mobile for 'mobile_without_country_code' (cleaned of country code) and append the remaining numbers to 'crm_note'.
   - Clean the primary phone number by splitting it into 'country_code' (e.g. +91, +1) and 'mobile_without_country_code' (only the main number digits, no country code). If no country code is found, default to +91 if it is a 10 digit number.
5. Notes/Remarks: Use 'crm_note' for remarks, follow-up comments, secondary emails, or extra phone numbers.
6. Line Breaks: Escape all newlines or carriage returns in any notes or descriptions to '\\n' to keep the records CSV compatible.
7. Skip Invalid Records: If a record contains neither a valid email nor a valid mobile number, set its status to 'skipped' and specify the 'skip_reason' as 'Record lacks both email and mobile number'. Set 'data' to null for skipped records.

Return the mapped output in JSON matching the requested schema. Ensure that you output exactly one mapped record for each raw record in the input batch.
`;

    const prompt = `
Raw Records to map:
${JSON.stringify(rows, null, 2)}
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: systemInstruction
    });

    const responseText = result.response.text();
    const parsedResponse = JSON.parse(responseText);

    if (parsedResponse && Array.isArray(parsedResponse.mappedRecords)) {
      // Re-format skipped records to match our unified structure
      return parsedResponse.mappedRecords.map((record, index) => {
        if (record.status === 'skipped') {
          return {
            status: 'skipped',
            skip_reason: record.skip_reason || 'Missing email and phone',
            data: null
          };
        }

        // Standardize keys to match backend expected format
        return {
          status: 'success',
          data: {
            created_at: record.created_at || new Date().toISOString().replace('T', ' ').substring(0, 19),
            name: record.name || 'Unknown',
            email: record.email || '',
            country_code: record.country_code || '+91',
            mobile_without_country_code: record.mobile_without_country_code || '',
            company: record.company || '',
            city: record.city || '',
            state: record.state || '',
            country: record.country || '',
            lead_owner: record.lead_owner || '',
            crm_status: record.crm_status || 'GOOD_LEAD_FOLLOW_UP',
            crm_note: record.crm_note || '',
            data_source: record.data_source || '',
            possession_time: record.possession_time || '',
            description: record.description || ''
          }
        };
      });
    } else {
      throw new Error("Invalid response format from Gemini");
    }
  } catch (error) {
    console.error("Gemini API error, falling back to heuristics:", error.message);
    // Fall back to heuristics for this batch
    return rows.map(mapRowHeuristics);
  }
}

module.exports = { extractBatch, mapRowHeuristics };
