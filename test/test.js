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
          import: true
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
    var total = 50;
    var products = _.map(_.range(0, 50), function(i) {
      return {
        title: 'Cheese #' + padInteger(i, 5),
        slug: 'cheese-' + padInteger(i, 5)
      };
    });
    fs.writeFileSync(apos.rootDir + '/data/temp/test.csv', stringify(products, { header: true }));
  });

  var jobId;

  it('start importing the products', function (done) {
    var req = apos.tasks.getReq();
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
  });

  it('import concludes within 4 seconds', function (done) {
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
        assert(body.job.processed === 50);
        jobId = body._id;
        done();
      });
    }
  });

  it('dump job data', function (done) {
    apos.modules['apostrophe-jobs'].db.find({}).toArray(function(err, jobs) {
      assert(!err);
      done();
    });
  });
});


function padInteger (i, places) {
  var s = i + '';
  while (s.length < places) {
    s = '0' + s;
  }
  return s;
}
