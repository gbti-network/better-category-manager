var $ = jQuery.noConflict();

const BCMAuth = {

    init: function() {
        BCM.debug.group('BCMAuth Initialization');

        try {
            BCM.debug.log('Starting BCMAuth initialization', {
                hasAccessToken: !!BCMAuth.githubAccessToken,
                currentPage: BCMAuth.currentPage,
                pluginUrl: BCMAuth.pluginUrl
            });
            
            this.checkAuthState();
            this.bindEvents();
            
            BCM.debug.log('BCMAuth initialization completed successfully');
        } catch (error) {
            BCM.debug.error('BCMAuth initialization failed:', {
                error: error.message,
                stack: error.stack
            });
        }
        BCM.debug.groupEnd();
    },

    bindEvents: function() {
        BCM.debug.group('Binding Events');
        try {
            $(document).on('click', '.github-auth-button', this.handleGitHubAuth.bind(this));
        } catch (error) {
            BCM.debug.error('Failed to bind events:', error);
        }
        BCM.debug.groupEnd();
    },

    checkAuthState: function() {
        BCM.debug.group('Checking Auth State');
        BCM.debug.log('Auth state check started', {
            hasAccessToken: !!BCMAuth.githubAccessToken
        });

        if (!BCMAuth.githubAccessToken) {
            $(document).trigger('BCM:auth-required');
            BCM.debug.groupEnd();
            return;
        }

        BCM.debug.log('Access token found, proceeding to sponsor check');
        this.checkSponsorStatus();
        BCM.debug.groupEnd();
    },

    checkSponsorStatus: function() {
        BCM.debug.group('Checking Sponsor Status');
        
        return $.ajax({
            url: BCMAuth.restUrl + 'BCM/v1/github/check-sponsor',
            method: 'POST',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('X-WP-Nonce', BCMAuth.nonce);
            },
            data: {
                force_refresh: false
            }
        }).done((response) => {
            BCM.debug.log('Sponsor check response:', response);

            if (response.is_sponsor) {
                BCM.debug.log('Valid sponsor confirmed, enabling features');
                $(document).trigger('BCM:sponsor-valid', {
                    user: response.user_info,
                    timestamp: new Date().toISOString()
                });
            } else {
                BCM.debug.error('Repository access denied', {
                    reason: 'Not a sponsor',
                    timestamp: new Date().toISOString()
                });
                $(document).trigger('BCM:sponsor-invalid', {
                    user: response.user_info,
                    timestamp: new Date().toISOString()
                });
            }
        }).fail((jqXHR, textStatus, errorThrown) => {
            BCM.debug.error('Sponsor check failed:', {
                status: textStatus,
                error: errorThrown,
                response: jqXHR.responseText
            });
            $(document).trigger('BCM:sponsor-invalid', {
                error: {
                    status: textStatus,
                    message: errorThrown
                },
                timestamp: new Date().toISOString()
            });
        });

        BCM.debug.groupEnd();
    },

    handleGitHubAuth: function(e) {
        e.preventDefault();
        BCM.debug.group('Handling GitHub Auth');
        
        const clientRedirectUri = BCMAuth.restUrl + 'BCM/v1/github/oauth-callback';
        BCM.debug.log('Initiating GitHub auth', {
            redirectUri: clientRedirectUri,
            state: BCMAuth.currentPage,
            timestamp: new Date().toISOString()
        });


        $.ajax({
            url: BCMAuth.gbtiServerUri + '/oauth/initiate',
            method: 'GET',
            dataType: 'json',
            data: {
                client_redirect_uri: clientRedirectUri,
                state: BCMAuth.currentPage
            }
        }).done((response) => {
            BCM.debug.log('Auth initiation response received', {
                hasAuthUrl: !!response.auth_url,
                responseStatus: 'success',
                responseTime: new Date().toISOString()
            });

            if (response.auth_url) {
                BCM.debug.log('Redirecting to GitHub auth URL', {
                    url: response.auth_url
                });
                window.location.href = response.auth_url;
            } else {
                BCM.debug.error('Failed to get authorization URL', {
                    response: response
                });
            }
        }).fail((jqXHR, textStatus, errorThrown) => {
            BCM.debug.error('Auth initiation failed', {
                status: jqXHR.status,
                statusText: jqXHR.statusText,
                responseText: jqXHR.responseText,
                textStatus: textStatus,
                errorThrown: errorThrown,
                failureTime: new Date().toISOString()
            });
        }).always(() => {
            BCM.debug.groupEnd();
        });
    }
};

$(document).ready(function() {
    BCMAuth.init();
});
