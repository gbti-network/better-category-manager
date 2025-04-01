/**
 * Utility functions for the Better Category Manager plugin
 */
(function($) {
    'use strict';

    window.BCATM = window.BCATM || {};
    
    BCATM.utils = {
        /**
         * Debounce function to limit the rate at which a function can fire
         */
        debounce: function(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        /**
         * Format a timestamp into a readable date string
         */
        formatDate: function(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleString();
        }
    };

})(jQuery);
