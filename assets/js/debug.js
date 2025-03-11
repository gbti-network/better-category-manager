/**
 * Debug utility functions for Better Category Manager
 */
(function($) {
    'use strict';

    window.BCM = window.BCM || {};
    
    BCM.debug = {
        isDebugMode: function() {
            return typeof BCMLogging !== 'undefined' && BCMLogging.debug_mode === true;
        },

        /**
         * Log a message to console if debug mode is enabled
         */
        log: function(message, data) {
            console.log('Logging message:', message, data);
            if (!this.isDebugMode() || typeof console === 'undefined') {
                return;
            }
            
            const prefix = '[BCM Debug] ';
            
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
            
            const prefix = '[BCM Error] ';
            
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
            console.group('[BCM Debug] ' + label);
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
