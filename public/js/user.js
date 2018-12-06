// Extend apostrophe-pieces with browser side code for imports.

apos.define('apostrophe-pieces', {

  afterConstruct: function(self) {
    self.importClickHandlers();
  },

  construct: function(self, options) {

    self.importClickHandlers = function() {
      // The rest of these are not part of the admin bar, follow our own convention
      apos.ui.link('apos-import', self.name, function($button, _id) {
        self.import();
      });
    };

    self.import = function() {
      return self.getTool('import-modal');
    };

  }
});
