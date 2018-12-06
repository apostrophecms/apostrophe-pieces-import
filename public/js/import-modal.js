// A modal for importing pieces

apos.define('apostrophe-pieces-import-modal', {

  extend: 'apostrophe-modal',

  source: 'import-modal',

  construct: function(self, options) {
    self.manager = options.manager;
    self.canceling = false;
    self.beforeShow = function(callback) {
      // Picking a file triggers the upload immediately
      self.$file = self.$el.find('[data-apos-file]');
      self.$file.fileupload({
        dataType: 'json',
        dropZone: self.$el,
        maxNumberOfFiles: 1,
        url: self.action + '/import',
        start: function (e) {
          self.hideForm();
        },
        done: function (e, data) {
          if (data.result.status !== 'ok') {
            alert(data.result.status);
            return;
          }
          self.jobId = data.result._id;
          self.startProgress();
        },
        add: function(e, data) {
          return data.submit();
        }
      });

      return setImmediate(callback);
    };

    self.startProgress = function() {
      self.progressInterval = setInterval(self.updateProgress, 1000);
      self.updateProgress();
    };

    self.updateProgress = function() {
      return self.api('import-progress', { _id: self.jobId }, function(data) {
        if (data.status === 'ok') {
          self.$el.find('[data-apos-progress-container]').html(data.html);
        }
        if (data.job.finished) {
          self.$el.find('.apos-pieces-import-cancel').hide();
          self.$el.find('.apos-pieces-import-done').show();
          self.finished = true;
        }
      });
    };

    self.afterHide = function() {
      if (self.progressInterval) {
        clearInterval(self.progressInterval);
      }
      if (self.finished) {
        apos.change(self.manager.name);
      }
    };

    self.hideForm = function() {
      self.$el.find('[data-apos-form]').hide();
    };

    self.beforeCancel = function(callback) {
      if ((!self.jobId) || (self.finished)) {
        // Easy to cancel when we haven't even started yet;
        // impossible to cancel once we're finished
        return setImmediate(callback);
      }
      apos.ui.globalBusy(true);
      self.canceling = true;
      if (self.progressInterval) {
        clearInterval(self.progressInterval);
      }
      return self.api('import-cancel', { _id: self.jobId }, function(data) {
        apos.ui.globalBusy(false);
        return callback(null);
      }, function(err) {
        apos.utils.error(err);
        // Even if some sort of network error occurs we can't do anything useful
        // at this point by keeping the modal up in this situation
        apos.ui.globalBusy(false);
        return callback(null);
      });
    };

  }
});
