var $ = jQuery.noConflict();

const BCATMSettings = {
    strings: BCATM_Settings.strings,
    init: function() {
        try {
            console.log('BCATM Settings: Initializing');
            this.bindEvents();
            this.initializeApiKeyValidation();
        } catch (error) {
            console.error('BCATMSettings initialization failed:', error);
        }
    },

    bindEvents: function() {
        // Navigation items
        $('.bcm-nav-item').on('click', this.handleNavClick.bind(this));
        
        // Handle OpenAI API key validation
        $('#openai_api_key').on('blur', this.validateApiKey.bind(this));
        
        // Handle Review Button
        $('.bcm-write-review').on('click', function(e) {
            e.preventDefault();
            window.open('https://wordpress.org/support/plugin/better-category-manager/reviews/#new-post', '_blank');
        });

        // Handle Issue Button
        $('.bcm-raise-issue').on('click', function(e) {
            e.preventDefault();
            window.open('https://github.com/gbti-network/better-category-manager/issues', '_blank');
        });

        // Handle Customization Button
        $('.bcm-request-customization').on('click', function(e) {
            e.preventDefault();
            window.open('https://github.com/gbti-network/better-category-manager/issues/new/choose', '_blank');
        });

        // Handle Sponsor Button
        $('.bcm-become-sponsor').on('click', function(e) {
            e.preventDefault();
            window.open('https://gbti.network/membership', '_blank');
        });
    },

    initializeApiKeyValidation: function() {
        // Wait a short moment to ensure the field is fully rendered
        setTimeout(() => {
            const apiKeyField = $('#openai_api_key');
            const apiKey = apiKeyField.val().trim();
            
            // Only validate if an API key exists
            if (apiKey !== '') {
                this.validateApiKey({ currentTarget: apiKeyField[0] });
            }
        }, 500);
    },

    validateApiKey: function(e) {
        const apiKeyField = $(e.currentTarget);
        const apiKey = apiKeyField.val().trim();
        
        // Clear previous validation messages
        $('.bcm-api-validation-message').remove();
        
        // Skip validation if field is empty
        if (apiKey === '') {
            return;
        }
        
        // Add loading indicator
        apiKeyField.after('<span class="bcm-api-validation-message bcm-validation-loading">' + 
                          '<span class="spinner is-active" style="float: none; margin: 0 5px;"></span>' +
                          this.strings.validatingApiKey + '</span>');
        
        // Make AJAX request to validate the API key
        $.ajax({
            url: BCATM_Settings.ajaxUrl,
            type: 'POST',
            data: {
                action: 'bcm_validate_openai_api_key',
                api_key: apiKey,
                nonce: BCATM_Settings.nonce
            },
            success: function(response) {
                $('.bcm-api-validation-message').remove();
                
                if (response.success) {
                    let message = response.data.message;
                    let iconClass = 'dashicons-yes';
                    
                    // If this is a cached response, use a different icon
                    if (response.data.cached) {
                        iconClass = 'dashicons-database-view';
                    }
                    
                    apiKeyField.after('<span class="bcm-api-validation-message bcm-validation-success">' +
                                      '<span class="dashicons ' + iconClass + '"></span> ' +
                                      message + '</span>');
                } else {
                    let message = response.data.message;
                    let iconClass = 'dashicons-no';
                    
                    // If this is a cached response, use a different icon
                    if (response.data.cached) {
                        iconClass = 'dashicons-database-view';
                    }
                    
                    apiKeyField.after('<span class="bcm-api-validation-message bcm-validation-error">' +
                                      '<span class="dashicons ' + iconClass + '"></span> ' +
                                      message + '</span>');
                }
            },
            error: function() {
                $('.bcm-api-validation-message').remove();
                apiKeyField.after('<span class="bcm-api-validation-message bcm-validation-error">' +
                                  '<span class="dashicons dashicons-no"></span> ' +
                                  BCATM_Settings.strings.connectionError + '</span>');
            }
        });
    },

    handleNavClick: function(e) {
        e.preventDefault();
        
        // Update active state
        $('.bcm-nav-item').removeClass('bcm-nav-active');
        $(e.currentTarget).addClass('bcm-nav-active');
        
        // For future implementation: load different content based on nav selection
        const navItemText = $(e.currentTarget).text().trim();
        console.log('Navigation clicked:', navItemText);
    }
};

$(document).ready(function() {
    BCATMSettings.init();
});