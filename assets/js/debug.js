/**
 * Debug utility functions for Advanced Category Manager
 */
(function($) {
    'use strict';

    window.BCATM = window.BCATM || {};
    
    BCATM.debug = {
        isDebugMode: function() {
            return typeof BCATMLogging !== 'undefined' && BCATMLogging.debug_mode === true;
        },

        /**
         * Log a message to console if debug mode is enabled
         */
        log: function(message, data) {
            console.log('Logging message:', message, data);
            if (!this.isDebugMode() || typeof console === 'undefined') {
                return;
            }
            
            const prefix = '[BCATM Debug] ';
            
            if (data !== undefined) {
                console.log(prefix + message, data);
            } else {
                console.log(prefix + message);
            }
        },

        /**
         * Log an error message
         */
        error: function(message, error) {
            if (!this.isDebugMode() || typeof console === 'undefined') {
                return;
            }
            
            const prefix = '[BCATM Error] ';
            
            if (error !== undefined) {
                console.error(prefix + message, error);
            } else {
                console.error(prefix + message);
            }
        },

        /**
         * Group related console messages
         */
        group: function(label) {
            if (!this.isDebugMode() || !console || !console.group) {
                return;
            }
            console.group('[BCATM Debug] ' + label);
        },

        /**
         * End a console message group
         */
        groupEnd: function() {
            if (!this.isDebugMode() || !console || !console.groupEnd) {
                return;
            }
            console.groupEnd();
        }
    };
})(jQuery);
