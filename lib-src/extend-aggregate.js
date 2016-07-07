let generateKey     = require('./generate-key')
  , hasBeenExtended = false
  ;

module.exports = function(mongoose, cache, debug) {
  let aggregate = mongoose.Model.aggregate;

  mongoose.Model.aggregate = function() {
    let res = aggregate.apply(this, arguments);

    if (!hasBeenExtended && res.constructor && res.constructor.name === 'Aggregate') {
      extend(res.constructor);
      hasBeenExtended = true;
    }

    return res;
  };

  function extend(Aggregate) {
    let exec = Aggregate.prototype.exec;

    Aggregate.prototype.exec = function(callback) {
      if (!this.hasOwnProperty('_ttl')) return exec.apply(this, arguments);

      let key     = this._key || this.getCacheKey()
        , ttl     = this._ttl
        , promise = new mongoose.Promise.ES6()
        ;

      promise.onResolve(callback);

      cache.get(key, (err, cachedResults) => {
        if (cachedResults) {
          if (debug) cachedResults._fromCache = true;
          promise.resolve(null, cachedResults);
        } else {
          exec.call(this).onResolve((err, results) => {
            if (err) return promise.resolve(err);
            cache.set(key, results, ttl, () => {
              promise.resolve(null, results);
            });
          });
        }
      });

      return promise;
    };

    Aggregate.prototype.cache = function(ttl = 60, customKey = '') {
      if (typeof ttl === 'string') {
        customKey = ttl;
        ttl = 60;
      }

      this._ttl = ttl;
      this._key = customKey;
      return this;
    };

    Aggregate.prototype.getCacheKey = function() {
      return generateKey(this._pipeline);
    };
  }
};
