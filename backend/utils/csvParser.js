const csv = require('csv-parser');
const { Readable } = require('stream');

/**
 * Parses a CSV buffer into JSON records.
 * Cleans header keys and string values by trimming whitespace.
 * 
 * @param {Buffer} buffer - CSV file buffer
 * @returns {Promise<Array<Object>>} Promise resolving to parsed records
 */
function parseCsv(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    // Convert buffer to string and handle potential UTF-8 Byte Order Mark (BOM)
    let csvString = buffer.toString('utf-8');
    if (csvString.startsWith('\uFEFF')) {
      csvString = csvString.slice(1);
    }

    const stream = Readable.from(csvString);
    
    stream
      .pipe(csv({
        mapHeaders: ({ header }) => header.trim().replace(/^["']|["']$/g, '')
      }))
      .on('data', (data) => {
        const cleanRow = {};
        for (const [key, value] of Object.entries(data)) {
          const cleanKey = key.trim();
          const cleanValue = typeof value === 'string' ? value.trim() : value;
          cleanRow[cleanKey] = cleanValue;
        }
        results.push(cleanRow);
      })
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

module.exports = { parseCsv };
