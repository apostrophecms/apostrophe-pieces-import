# apostrophe-pieces-import

This module adds an optional import feature to all `apostrophe-pieces` in an [Apostrophe](http://apostrophecms.org) project.

## in app.js

```javascript
modules: {
  'apostrophe-pieces-import': {},
  // other modules...
  'my-module-that-extends-pieces': {
    // Without this, there is no import functionality for this type.
    // Not all types are great candidates for imports.
    import: true
  }
}
```

## In `views/managerModal.html` of your module that extends pieces

```markup
{%- extends "managerModalBase.html" -%}
{%- import "piecesMacros.html" as pieces with context -%}
{%- import "piecesImportMacros.html" as piecesImport with context -%}
{%- import 'apostrophe-ui:components/buttons.html' as buttons with context -%}

{%- block controls -%}
  {{ buttons.minor('Import', { action: 'import-' + data.options.name }) }}
  {{ pieces.manageControls() }}
{%- endblock -%}
```

## Preparing the data file

CSV files must have a `.csv` extension. TSV files must have a `.tsv` extension. Excel files should be in `.xlsx`, `.xlsb` or `.xls` format.

The first row must contain the column headings, which must match the **names** (not labels, so far) of your schema fields **exactly**.

The `tags` field, if present, must be comma-separated internally (CSV has no trouble escaping commas).

If your schema contains areas, plain text (with properly escaped newlines, in the case of CSV) can be imported for those columns.

## Importing a file

Just click the "import" button in the "manage" view of your pieces and you'll be invited to pick a file. Once you select it a progress display appears. When the import completes, statistics are provided displaying the count of successful records and errors.

If you click "cancel" before the import is complete, all pieces imported so far are deleted.

## Updating existing pieces

You can also update existing pieces via this module.

To do that, you will need one (and only one) **key column** in your file. This column's name **must be exactly the name of the existing field** that uniquely identifies each row as an update of a specific existing piece, **followed by `:key`**.

For instance, if you need to change the usernames of users in bulk, you might prepare a CSV file like this:

```
username:key,username
bobsmith,bob.smith
janedoe,jane.doe
```

The key column is the *old value*. You may optionally also present a *new value* for that same column in a separate column without `:key`. You may also include other columns, as you see fit. The important thing is that you must have one and only one `:key` column in order to carry out updates.

## Mixing inserts and updates

If a row has no value for your `:key` column, it is treated as an insert, rather than an update.

## Extending the import process for your type

By default, the importer simply uses apostrophe schemas to accept all of the fields. You can change this if you need to accept additional or differently formatted information.

In **your module that extends pieces**, just override `importBeforeInsert`:

```javascript
self.importBeforeInsert = function(job, record, piece, callback) {
  // You should really do some sanitization here
  piece.normalSaneField = record.wackyCustomField;
  return callback(null);
};
```

If you need to wait until the piece has already been inserted, override `importafterInsert` instead.

## File formats beyond CSV, TSV and Excel

`apostrophe-pieces-import` supports `.csv`, `.tsv` and Excel formats right out of the box. But of course you want more.

So you'll need to call `importAddFormat`, providing a name (the typical file extension) and a `format` object with, at a minimum, `parse`, `convert`, `sniff` and `count` properties.

`parse` can be one of two things:

**1. Stream interface:** a function that, taking no arguments, returns a node.js stream that a file can be piped into; the stream should emit readable events and support the read() method
in the usual way, and emit events in the usual way. The
read() method of the stream must return an object with property names hopefully corresponding to schema field names.

**2. Callback interface:** a function that, accepting the filename
as its first argument and a callback as its second argument, parses the data and
invokes the callback with `(null, array)` where `array` contains one object for each
row, with property names corresponding
to the column headers as appropriate. In the event of an error, the error should be
passed to the callback as the first argument. This option is to be avoided for very large
files but it is useful when importing formats for which no streaming interface
is available.

`convert` should be set to `'string'` if the properties of each object read
from the stream are always strings, or `form` if they correspond to the format submitted
by apostrophe's forms on the front end. If in doubt, use `string`.

`sniff` must be a synchronous function that accepts the filename the browser is claiming
for the upload and, as a second argument, the actual path to it on disk. The function should
check the filename or, if absolutely necessary, run a quick, synchronous check of the first 1K or so of the actual file to determine if it is of the appropriate format. If so it should return true. Otherwise it must return false.

`count` is an async function that takes a filename and a callback, and invokes the callback
with an error if any, and the number of records in the file as the second argument. It is
used for progress display.

Here is what an implementation for `.csv` files would look like if we didn't have it already:

```javascript
self.importAddFormat('csv', {
  parse: function() {
    return require('csv-parse')({ columns: true });
  },
  // Use the schema field converters for plaintext strings
  convert: 'string',
  sniff: function(originalFilename, actualFilename) {
    return originalFilename.match(/\.csv$/i);
  },
  count: function(filename, callback) {
    return require('count-lines-in-file')(filename, callback);
  }
});
```

## Making new file formats available throughout your project

If you call `importAddFormat` in your module that extends pieces, you're adding it just for that one type.

If you call it from `lib/modules/apostrophe-pieces/index.js` in your project, you're adding it for all pieces in your project. **Make sure you check that import is turned on:**

```javascript
// lib/modules/apostrophe-pieces/index.js
module.exports = {
  construct: function(self, options) {
    if (options.import) {
      self.importAddFormat('xlsx', {
        // your definition here
      });
    }
  }
}
```

*The method won't exist if the import option is not active for this type.*

## Making new file formats available to everyone

Pack it up in an npm module called, let's say, `pieces-import-fancyformat`. Your `index.js` will look like:

```javascript
// node_modules/pieces-import-xlsx/index.js
module.exports = {
  // Further improve the apostrophe-pieces module throughout projects
  // that add this module
  improve: 'apostrophe-pieces',
  construct: function(self, options) {
    if (options.import) {
      self.importAddFormat('xlsx', {
        // your definition here
      });
    }
  }
}
```

This module further improves `apostrophe-pieces`. In `app.js` developers will want to include both:

```javascript
// app.js
modules: {
  'apostrophe-pieces-import': {},
  'pieces-import-fancyformat': {}
}
```

> To avoid confusion with our official modules, please don't call your own module `apostrophe-pieces-import-fancyformat` without coordinating with us first. Feel free to use your own prefix.
