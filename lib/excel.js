var _ = require('lodash');
var fs = require('fs');

function getRows(filename, callback) {
  return fs.readFile(filename, function(err, data) {
    if (err) {
      console.error(err);
      return callback(err);
    }
    try {
      var XLSX = require('xlsx');
      var wb = XLSX.read(data);
      var sheetName = _.keys(wb.Sheets)[0];
      if (!sheetName) {
        return callback(new Error('No Worksheets in Spreadsheet'));
      }
      var objects = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
      return callback(null, objects);
    } catch (e) {
      console.error(e);
      return callback(e);
    }
  });
}

module.exports = {
  parse: function(filename, callback) {
    return getRows(filename, callback);
  },
  // Use the schema field converters for plaintext strings
  convert: 'string',
  sniff: function(originalFilename, actualFilename) {
    return originalFilename.match(/\.(xls|xlsx|xlsb)$/i);
  },
  count: function(filename, callback) {
    // Yes, parsing twice is silly, but that's what we have to work with
    return getRows(filename, function(err, objects) {
      if (err) {
        return callback(err);
      }
      return callback(null, objects.length);
    });
  }
}
