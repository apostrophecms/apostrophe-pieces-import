var parse = require('csv-parse');
var cuid = require('cuid');
var _ = require('lodash');
var fs = require('fs');
var async = require('async');
var countLinesInFile = require('./lib/countLinesInFile.js');

module.exports = {
  improve: 'apostrophe-pieces',
  collectionName: 'aposPiecesImportJobs',

  afterConstruct: function(self, callback) {
    // Make sure it's enabled for this particular subclass of pieces
    if (!self.options.import) {
      return setImmediate(callback);
    }
    self.importAddRoutes();
    self.importPushAssets();
    self.importPushDefineRelatedTypes();
    return self.importEnsureCollection(callback);
  },

  construct: function(self, options) {

    self.importFormats = {
      csv: {
        parse: function() {
          return parse({ columns: true });
        },
        // Use the schema field converters for plaintext strings
        convert: 'string',
        sniff: function(originalFilename, actualFilename) {
          return originalFilename.match(/\.csv$/i);
        },
        count: function(filename, callback) {
          return countLinesInFile(filename, callback);
        }
      },
      tsv: {
        parse: function() {
          return parse({
            columns: true,
            delimiter: '\t'
          });
        },
        // Use the schema field converters for plaintext strings
        convert: 'string',
        sniff: function(originalFilename, actualFilename) {
          return originalFilename.match(/\.tsv$/i);
        },
        count: function(filename, callback) {
          return countLinesInFile(filename, callback);
        }
      },
      excel: require('./lib/excel.js')
    };

    // Add support for a new input format. `name` is the typical file extension, such as `csv`.
    // `format` is an object with, at a minimum, `parse`, `convert`, `sniff` and
    // `count` properties.
    //
    // There are two acceptable forms for `parse`:
    //
    // 1. A function that, taking no arguments, returns a node.js stream that a file
    // can be piped into; the stream should emit readable events and support the read() method
    // in the usual way, and emit events in the usual way. The
    // read() method of the stream must return an object with property names corresponding to the column
    // names and values corresponding to the values for each column in this row. This
    // form is preferred because it avoids exhausting memory and/or pausing the
    // website by reading and parsing large files synchronously.
    //
    // 2. A function that, accepting the filename as its first argument and a callback as
    // its second argument, parses the data and invokes the callback with `(null, array)`
    // where `array` containing one object for each row, with property names corresponding
    // to the column headers as appropriate. In the event of an error an error should be
    // passed to the callback as the first argument. This option is to be avoided for very large
    // files but it is useful when importing formats for which no streaming interface
    // is available.
    //
    // `convert` should be set to `'string'` if the properties of each object read
    // from the stream are always strings, or `form` if they correspond to the format submitted
    // by apostrophe's forms on the front end. If in doubt, use `string`.
    //
    // `sniff` must be a synchronous function that accepts the filename the browser is claiming
    // for the upload and, as a second argument, the actual path to it on disk. The function should
    // check the filename or, if absolutely necessary, make a quick check of the first 1K or so
    // of the actual file to determine if it is of the appropriate format. If so it should return true.
    // Otherwise it must return false.
    //
    // `count` is an async function that takes a filename and a callback, and invokes the callback
    // with an error if any, and the number of records in the file as the second argument. It is
    // used for progress display. An approximate number is acceptable.

    self.importAddFormat = function(name, format) {
      self.importFormats[name] = format;
    };

    self.importAddRoutes = function() {

      self.route('post', 'import-modal', function(req, res) {
        return res.send(self.render(req, 'importModal', {
          options: {
            label: self.label,
            pluralLabel: self.pluralLabel,
            name: self.name
          }
        }));
      });

      self.route('post', 'import-progress', function(req, res) {

        var _id = self.apos.launder.id(req.body._id);
        return self.db.findOne({ _id: _id }, function(err, job) {
          if (err) {
            self.apos.utils.error(err);
            return respond({ failed: true });
          }
          if (!job) {
            return respond({ notFound: true });
          }
          // % of completion rounded off to 2 decimal places
          if (!job.total) {
            job.percentage = 0;
          } else {
            job.percentage = (job.processed / job.total * 100).toFixed(2);
          }
          return respond(job);
        });

        function respond(info) {
          self.importBeforeProgress(info);
          return res.send({
            status: 'ok',
            job: info._id && info,
            html: self.render(req, 'importProgress', info)
          });
        }

      });

      self.route('post', 'import-cancel', function(req, res) {
        var _id = self.apos.launder.id(req.body._id);
        return self.db.update({ _id: _id }, { $set: { canceling: true } }, function(err) {
          // There really isn't much we can do if this didn't work.
          if (err) {
            self.apos.utils.error(err);
          }
          return res.send({ status: 'ok' });
        });
      });

      self.route('post', 'import', self.apos.middleware.files, function(req, res) {
        var file = req.files.file;
        if (!file) {
          return res.send({ status: 'required' });
        }
        var job = {
          _id: cuid(),
          accepted: 0,
          processed: 0,
          errors: 0,
          when: new Date()
        };
        // LACK OF RETURN STATEMENT IS INTENTIONAL. Let the browser go on its way and start
        // AJAXing us back for progress updates. -Tom
        res.send({
          status: 'ok',
          _id: job._id
        });

        // Do the real work, without worrying about the browser hanging up

        return async.series([ insertAndSniff, count, storeCount ], function(err) {
          if (err) {
            self.apos.utils.error(err);
            return self.importFailed(job);
          }
          if (job.format.parse.length === 0) {
            // Now kick off the stream processing
            var parser = job.format.parse();
            parser.on('readable', _.partial(self.importRecordsWhileAvailable, job));
            parser.on('error', _.partial(self.importFailed, job));
            parser.on('finish', _.partial(self.importFinished, job));
            fs.createReadStream(file.path).pipe(parser);
            job.parser = parser;
          } else {
            // Allow the simpler type of parse function to drive the
            // same methods that otherwise listen to a stream
            return job.format.parse(file.path, function(err, data) {
              if (err) {
                self.apos.utils.error(err);
                return self.importFailed(job);
              }
              var i = 0;
              job.parser = {
                read: function() {
                  if (i === data.length) {
                    self.importFinished(job);
                    return false;
                  }
                  return data[i++];
                }
              };
              self.importRecordsWhileAvailable(job);
            });
          }
        });

        function insertAndSniff(callback) {
          // Insert the job in the jobs collection, then sniff the format
          return self.db.insert(job, function(err) {
            if (err) {
              return res.send({ status: 'error' });
            }
            // We don't want this monster in mongodb so we add it later. All the other updates to the
            // job object in the database use $inc, $set, etc. Keep it light. -Tom
            job.req = req;
            var formatName = self.importSniff(file.originalFilename, file.path);
            if (!formatName) {
              return callback(new Error('unsupported format'));
            }
            job.format = self.importFormats[formatName];
            job.formatName = formatName;
            return callback(null);
          });
        }

        function count(callback) {
          return self.importCount(job, file.path, function(err, total) {
            if (err) {
              return self.importFailed(job);
            }
            job.total = total;
            return callback(null);
          });
        }

        function storeCount(callback) {
          return self.db.update({ _id: job._id }, { $set: { total: job.total } }, callback);
        }
      });

    };

    // Determine the file format, via the sniff methods of the various formats;
    // first match wins
    self.importSniff = function(originalFilename, actualFilename) {
      var name;
      _.each(self.importFormats, function(format, _name) {
        if (format.sniff(originalFilename, actualFilename)) {
          name = _name;
          return false;
        }
      });
      return name;
    };

    // Count the records for progress display purposes, via the count method of the format
    self.importCount = function(job, filename, callback) {
      return job.format.count(filename, callback);
    };

    self.importRecordsWhileAvailable = function(job) {
      if (job.reading) {
        // Don't double-invoke this loop as we want to import the records
        // serially and in order. We get pelted with readable events
        // even when we haven't read what we've got coming. ):
        return;
      }
      job.reading = true;
      function one() {
        if (job.canceling) {
          // If we're trying to cancel the job, don't process more records
          job.reading = false;
          return;
        }
        var record = job.parser.read();
        if (!record) {
          // We have to wait for another readable event to fire
          job.reading = false;
          if (self.importFinishing) {
            self.importEndOfFile(job);
          }
          return;
        }
        return self.importCancelOrContinue(job, function() {
          // Track that we're in mid-import of a record so the cancellation
          // code can wait
          job.importing = true;
          return self.importRecord(job, record, function(err) {
            job.importing = false;
            if (err) {
              // This shouldn't happen for an ordinary bad record, that just increments the error count
              return self.importFailed(job);
            }
            // Repeat until we run out
            return one();
          });
        });
      };
      one();
    };

    // If the user has requested to cancel the job, cancel it.
    // Otherwise invoke the callback. Note the callback is not
    // invoked at all in the event of a cancellation.

    self.importCancelOrContinue = function(job, callback) {

      return self.db.findOne({ _id: job._id }, function(err, _job) {
        if (err || (!_job)) {
          // We can't do much in this situation
          self.apos.utils.error(err, _job);
          return;
        }
        if (!_job.canceling) {
          return callback(null);
        }

        job.canceling = true;

        if (job.parser.end) {
          // Do our best to close the input stream down,
          // node's readable interface has no documented way
          // of doing this: https://www.bennadel.com/blog/2692-you-have-to-explicitly-end-streams-after-pipes-break-in-node-js.htm
          job.parser.end();
        }

        return async.series([ waitForLast, markCanceled, remove ]);

        function waitForLast(callback) {
          // Don't wind up with the last item being imported surviving past
          // the remove() call
          if (!job.importing) {
            return callback(null);
          }
          return setTimeout(function() {
            return waitForLast(callback);
          }, 50);
        }

        function markCanceled(callback) {
          return self.db.update({ _id: job._id }, {
            $set: {
              canceled: true,
              canceling: false
            }
          }, callback);
        }

        function remove(callback) {
          return self.apos.docs.db.remove({ importJobId: job._id }, callback);
        }

      });

    };

    self.importEndOfFile = function(job) {
      return self.importCancelOrContinue(job, function() {
        return self.db.update({ _id: job._id }, { $set: { finished: true } }, function(err) {
          if (err) {
            // There's nothing more we can do to communicate about the job
            self.apos.utils.error(err);
          }
        });
      });
    };

    self.importRecord = function(job, record, callback) {
      var piece = self.newInstance();
      piece.importedAt = job.when;
      piece.importJobId = job._id;
      var key = _.find(_.keys(record), function(key) {
        return key.match(/:key$/);
      });
      var keyField;
      if (key) {
        keyField = key.replace(/:key$/, '');
      }
      if (key && record[key]) {
        return async.series([ findForUpdate, convert, beforeUpdate, update, afterUpdate ], outcome);
      } else {
        return async.series([ convert, before, insert, after ], outcome);
      }
      function outcome(err) {
        // Don't flunk the whole job for one bad row, just report it
        if (err) {
          self.apos.utils.error(err);
          return self.db.update({ _id: job._id }, {
            $inc: {
              errors: 1,
              processed: 1
            },
            $addToSet: {
              errorMessages: err
            }
          }, callback);
        } else {
          return self.db.update({ _id: job._id }, {
            $inc: {
              accepted: 1,
              processed: 1
            }
          }, callback);
        }
      }
      function findForUpdate(callback) {
        var query = {};
        query[keyField] = record[key];
        // It's perfectly reasonable to update/replace something
        // in the trash or unpublished, including making it live again
        // or publishing it
        return self.find(job.req, query).trash(null).published(null).toObject(function(err, existing) {
          if (err) {
            return callback(err);
          }
          if (!existing) {
            return callback('update-notfound ' + query[keyField]);
          }
          piece = existing;
          return callback(null);
        });
      }
      function convert(callback) {
        return self.importConvert(job, record, piece, callback);
      }
      function before(callback) {
        return self.importBeforeInsert(job, record, piece, callback);
      }
      function beforeUpdate(callback) {
        return self.importBeforeUpdate(job, record, piece, callback);
      }
      function insert(callback) {
        return self.importInsert(job, piece, callback);
      }
      function update(callback) {
        return self.importUpdate(job, piece, callback);
      }
      function after(callback) {
        return self.importAfterInsert(job, record, piece, callback);
      }
      function afterUpdate(callback) {
        return self.importAfterUpdate(job, record, piece, callback);
      }
    };

    self.importConvert = function(job, record, piece, callback) {
      var schema = _.filter(self.schema, function(field) {
        return _.has(record, field.name);
      });
      return self.apos.schemas.convert(job.req, schema, job.format.convert, record, piece, callback);
    };

    // Override this method as you see fit. req is available as `job.req`. The
    // data received is available as `record`; it is an object with
    // property names based on the header row (or equivalent). `convert` has
    // already been used to do ordinary schema field type conversions, so
    // many properties of `piece` may already be set

    self.importBeforeInsert = function(job, record, piece, callback) {
      // It's OK to invoke this callback synchronously because we know the previous
      // operation (convert) is always async, so there is no stack crash risk. -Tom
      return callback(null);
    };

    // Override this method as you see fit. req is available as `job.req`. The
    // data received  is available as `record`; it is an object with
    // property names based on the header row (or equivalent). `convert` has
    // already been used to do ordinary schema field type conversions, so
    // many properties of `piece` may already be set, plus those already
    // present since this is an update and we fetch the existing piece before
    // this point

    self.importBeforeUpdate = function(job, record, piece, callback) {
      // It's OK to invoke this callback synchronously because we know the previous
      // operation (convert) is always async, so there is no stack crash risk. -Tom
      return callback(null);
    };

    self.importInsert = function(job, piece, callback) {
      return self.insert(job.req, piece, callback);
    };

    self.importUpdate = function(job, piece, callback) {
      return self.update(job.req, piece, callback);
    };

    // Override this method as you see fit. req is available as `job.req`. The
    // data received  is available as `record`; it is an object with
    // property names based on the header row (or equivalent).
    //
    // The piece has already been inserted at this point which may be helpful
    // if you need to know the _id

    self.importAfterInsert = function(job, record, piece, callback) {
      // It's OK to invoke this callback synchronously because we know the previous
      // operation (insert) is always async, so there is no stack crash risk. -Tom
      return callback(null);
    };

    // Override this method as you see fit. req is available as `job.req`. The
    // data received  is available as `record`; it is an object with
    // property names based on the header row (or equivalent).

    self.importAfterUpdate = function(job, record, piece, callback) {
      // It's OK to invoke this callback synchronously because we know the previous
      // operation (insert) is always async, so there is no stack crash risk. -Tom
      return callback(null);
    };

    self.importFailed = function(job, err) {
      return self.db.update({ _id: job._id }, { $set: { failed: true } }, function(err) {
        if (err) {
          // There's nothing more we can do to communicate about the job
          self.apos.utils.error(err);
        }
      });
    };

    self.importFinished = function(job) {
      self.importFinishing = true;
    };

    // A chance to modify the data being provided to the importProgress.html template by overriding.
    self.importBeforeProgress = function(info) {
    };

    self.importEnsureCollection = function(callback) {
      self.db = self.apos.db.collection(self.options.collectionName);
      return setImmediate(callback);
    };

    self.importPushDefineRelatedTypes = function() {
      self.apos.push.browserMirrorCall('user', self, {
        tool: 'import-modal',
        stop: 'apostrophe-pieces'
      });
    };

    self.importPushAssets = function() {
      self.pushAsset('script', 'import-modal', { when: 'user' });
    };

    const superGetManagerControls = self.getManagerControls;
    self.getManagerControls = function (req) {
      const controls = _.clone(superGetManagerControls(req));
      if (self.options.import) {
        const addIndex = _.findIndex(controls, function (control) {
          return control.action.match(/^(upload|create)/);
        });
        const control = {
          type: 'minor',
          label: 'Import',
          action: 'import-' + self.apos.utils.cssName(self.name)
        };
        if (addIndex >= 0) {
          controls.splice(addIndex, 0, control);
        } else {
          controls.push(control);
        }
      }
      return controls;
    };

  }
};
