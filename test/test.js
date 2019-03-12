var assert = require('assert');
var _ = require('lodash');
var request = require('request');
var stringify = require('csv-stringify/lib/es5/sync');
var fs = require('fs');

describe('apostrophe-pieces-import', function () {
  var apos;

  this.timeout(5000);

  after(function (done) {
    require('apostrophe/test-lib/util').destroy(apos, done);
  });

  it('should initialize apostrophe', function (done) {
    apos = require('apostrophe')({
      testModule: true,
      baseUrl: 'http://localhost:7780',
      modules: {
        'apostrophe-express': {
          port: 7780,
          csrf: false
        },

        'apostrophe-pieces-import': {},

        'products': {
          extend: 'apostrophe-pieces',
          name: 'product',
          import: true,
          alias: 'products',
          sort: { title: 1 },
          addFields: [
            {
              type: 'area',
              name: 'richText',
              widgets: {
                'apostrophe-rich-text': {}
              },
              importAsRichText: true
            },
            {
              type: 'area',
              name: 'plaintext',
              widgets: {
                'apostrophe-rich-text': {}
              }
            }
          ]
        },

        'test-as-admin': {
          construct: function(self, options) {
            self.expressMiddleware = function(req, res, next) {
              req.user = {
                username: 'admin',
                _id: 'admin',
                _permissions: {
                  admin: true
                }
              };
              next();
            };
          }
        }
      },
      afterInit: function (callback) {
        assert(apos.modules.products);
        assert(apos.modules.products.options.import);
        return callback(null);
      },
      afterListen: function (err) {
        assert(!err);
        done();
      }
    });
  });

  it('generate test csv file of products', function () {
    var products = _.map(_.range(0, 50), function(i) {
      return {
        title: 'Cheese #' + padInteger(i, 5),
        slug: 'cheese-' + padInteger(i, 5),
        richText: '<h4>This is rich text</h4>',
        plaintext: '<h4>This will get escaped</h4>'
      };
    });
    fs.writeFileSync(apos.rootDir + '/data/temp/test.csv', stringify(products, { header: true }));
  });

  var jobId;

  it('start importing the products', function (done) {
    submitJob(done);
  });

  it('import concludes within 4 seconds', function (done) {
    monitorJob(50, done);
  });

  it('check results', function() {
    return apos.products.find(apos.tasks.getReq()).toArray().then(function(pieces) {
      assert(pieces.length === 50);
      assert(pieces[0].title === 'Cheese #00000');
      assert(pieces[0].richText.items[0].content === '<h4>This is rich text</h4>');
      assert(pieces[0].plaintext.items[0].content === '&lt;h4&gt;This will get escaped&lt;/h4&gt;');
    });
  });

  it('generate test csv file of updates', function () {
    var products = _.map(_.range(0, 10), function(i) {
      return {
        title: 'Cheese Food #' + padInteger(i, 5),
        'slug:key': 'cheese-' + padInteger(i, 5)
      };
    });
    fs.writeFileSync(apos.rootDir + '/data/temp/test.csv', stringify(products, { header: true }));
  });

  it('start importing the updates', function (done) {
    submitJob(done);
  });

  it('import of updates concludes within 4 seconds', function (done) {
    monitorJob(10, done);
  });

  it('check results', function() {
    return apos.products.find(apos.tasks.getReq()).toArray().then(function(pieces) {
      assert(pieces.length === 50);
      assert(_.find(pieces, { title: 'Cheese Food #00000' }));
      assert(!_.find(pieces, { title: 'Cheese #00000' }));
    });
  });

  it('should be able to trash and unpublish a product via an update: generate file', function() {
    var products = [
      {
        title: 'Cheese Food #00000',
        'slug:key': 'cheese-00000',
        published: '0',
        trash: '1'
      }
    ];
    fs.writeFileSync(apos.rootDir + '/data/temp/test.csv', stringify(products, { header: true }));
  });

  it('should be able to trash and unpublish a product via an update: submit job', function(done) {
    submitJob(done);
  });

  it('should be able to trash and unpublish a product via an update: submit job', function(done) {
    monitorJob(1, done);
  });

  it('verify unable to fetch trashed, unpublished product normally', function() {
    return apos.products.find(apos.tasks.getReq(), { slug: 'cheese-00000' }).toObject().then(function(piece) {
      assert(!piece);
    });
  });

  it('verify properties of trashed, unpublished product', function() {
    return apos.docs.db.findOne({ slug: 'cheese-00000' }).then(function(piece) {
      assert(piece);
      assert(piece.trash);
      assert(!piece.published);
    });
  });

  it('should be able to untrash and republish a product via an update: generate file', function() {
    var products = [
      {
        title: 'Cheese Food #00000',
        'slug:key': 'cheese-00000',
        published: '1',
        trash: '0'
      }
    ];
    fs.writeFileSync(apos.rootDir + '/data/temp/test.csv', stringify(products, { header: true }));
  });

  it('should be able to untrash and republish a product via an update: submit job', function(done) {
    submitJob(done);
  });

  it('should be able to untrash and republish a product via an update: submit job', function(done) {
    monitorJob(1, done);
  });

  it('able to fetch untrashed, republished product normally', function() {
    return apos.products.find(apos.tasks.getReq(), { slug: 'cheese-00000' }).toObject().then(function(piece) {
      assert(piece);
      assert(piece.published);
      assert(!piece.trash);
    });
  });

  function submitJob(done) {
    request.post({
      url: 'http://localhost:7780/modules/products/import',
      formData: {
        file: fs.createReadStream(apos.rootDir + '/data/temp/test.csv')
      },
      json: true
    }, function(err, response, body) {
      assert(!err);
      assert(response.statusCode === 200);
      assert(body.status === 'ok');
      jobId = body._id;
      done();
    });
  }

  function monitorJob(expect, done) {
    setTimeout(check, 4000);
    function check() {
      request.post({
        url: 'http://localhost:7780/modules/products/import-progress',
        json: true,
        body: {
          _id: jobId
        }
      }, function(err, response, body) {
        assert(!err);
        assert(response.statusCode === 200);
        assert(body.status === 'ok');
        assert(body.job.finished);
        assert(!body.job.errors);
        assert(body.job.processed === expect);
        jobId = body._id;
        done();
      });
    }
  }

});

function padInteger (i, places) {
  var s = i + '';
  while (s.length < places) {
    s = '0' + s;
  }
  return s;
}
