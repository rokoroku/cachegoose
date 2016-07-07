'use strict';

var generateKey = require('./generate-key'),
    hasBeenExtended = false;

module.exports = function (mongoose, cache, debug) {
  var aggregate = mongoose.Model.aggregate;

  mongoose.Model.aggregate = function () {
    var res = aggregate.apply(this, arguments);

    if (!hasBeenExtended && res.constructor && res.constructor.name === 'Aggregate') {
      extend(res.constructor);
      hasBeenExtended = true;
    }

    return res;
  };

  function extend(Aggregate) {
    var exec = Aggregate.prototype.exec;

    Aggregate.prototype.exec = function (callback) {
      var _this = this;

      if (!this.hasOwnProperty('_ttl')) return exec.apply(this, arguments);

      var key = this._key || this.getCacheKey(),
          ttl = this._ttl,
          promise = mongoose.Promise.ES6;

      return new promise(function (resolve, reject) {
        cache.get(key, function (err, cachedResults) {
          if (cachedResults) {
            if (debug) cachedResults._fromCache = true;
            resolve(cachedResults);
          } else {
            exec.call(_this).then(function (results) {
              cache.set(key, results, ttl, function () {
                resolve(results);
              });
            })['catch'](function (err) {
              reject(err);
            });
          }
        });
      });

      return promise;
    };

    Aggregate.prototype.cache = function () {
      var ttl = arguments.length <= 0 || arguments[0] === undefined ? 60 : arguments[0];
      var customKey = arguments.length <= 1 || arguments[1] === undefined ? '' : arguments[1];

      if (typeof ttl === 'string') {
        customKey = ttl;
        ttl = 60;
      }

      this._ttl = ttl;
      this._key = customKey;
      return this;
    };

    Aggregate.prototype.getCacheKey = function () {
      return generateKey(this._pipeline);
    };
  }
};