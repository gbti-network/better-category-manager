jQuery(document).ready(function($) {
    // Check for stored notices and display them
    displayStoredNotices();
    
    // Export functionality
    $('#BCM-export-taxonomies').on('click', function() {
        const currentTaxonomy = $('#category-select').val();
        
        $.ajax({
            url: BCMData.ajaxurl,
            type: 'POST',
            data: {
                action: 'BCM_export_taxonomies',
                nonce: BCMData.nonce,
                taxonomy: currentTaxonomy
            },
            success: function(response) {
                if (response.success) {
                    // Create and download the export file
                    const blob = new Blob([JSON.stringify(response.data.data, null, 2)], {type: 'application/json'});
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = response.data.filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    
                    // Store success message
                    storeNotice('success', BCMData.i18n.export_success);
                } else {
                    // Store error message
                    storeNotice('error', response.data || BCMData.i18n.export_error);
                    console.error('Export error:', response.data);
                }
            },
            error: function(xhr, status, error) {
                // Store error message
                storeNotice('error', BCMData.i18n.export_error);
                console.error('AJAX error:', status, error);
            }
        });
    });

    // Import functionality
    $('#BCM-import-taxonomies').on('click', function() {
        $('#BCM-import-file').click();
    });

    $('#BCM-import-file').on('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/json') {
            storeNotice('error', BCMData.i18n.invalid_file);
            displayStoredNotices();
            return;
        }

        const formData = new FormData();
        formData.append('action', 'BCM_import_taxonomies');
        formData.append('nonce', BCMData.nonce);
        formData.append('import_file', file);

        // Show loading indicator
        const importButton = $('#BCM-import-taxonomies');
        const originalText = importButton.text();
        importButton.prop('disabled', true).text('Importing...');

        $.ajax({
            url: BCMData.ajaxurl,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                importButton.prop('disabled', false).text(originalText);
                if (response.success) {
                    // Store the success message with details
                    storeNotice('success', BCMData.i18n.import_success + '<br>' + response.data.message);
                    
                    // If there are warnings, add them to the notice
                    if (response.data.details && response.data.details.warnings && response.data.details.warnings.length > 0) {
                        console.group('Import Warnings');
                        response.data.details.warnings.forEach(warning => console.warn(warning));
                        console.groupEnd();
                    }
                    
                    // Reload the page to display updated categories
                    location.reload();
                } else {
                    // Store error message and display immediately without reload
                    storeNotice('error', response.data || BCMData.i18n.import_error);
                    displayStoredNotices();
                    console.error('Import error:', response.data);
                }
            },
            error: function(xhr, status, error) {
                importButton.prop('disabled', false).text(originalText);
                // Store error message and display immediately without reload
                storeNotice('error', BCMData.i18n.import_error);
                displayStoredNotices();
                console.error('AJAX error:', status, error);
            }
        });
    });
    
    // Function to store a notice in sessionStorage
    function storeNotice(type, message) {
        sessionStorage.setItem('BCM_notice_type', type);
        sessionStorage.setItem('BCM_notice_message', message);
    }
    
    // Function to display stored notices
    function displayStoredNotices() {
        const noticeType = sessionStorage.getItem('BCM_notice_type');
        const noticeMessage = sessionStorage.getItem('BCM_notice_message');
        
        if (noticeType && noticeMessage) {
            // Create notice element
            const noticeClass = noticeType === 'success' ? 'notice-success' : 'notice-error';
            const notice = $(`
                <div class="notice ${noticeClass} BCM-notice is-dismissible">
                    <p>${noticeMessage}</p>
                </div>
            `);
            
            // Add it to the page
            const noticeContainer = $('.BCM-notice-container');
            if (noticeContainer.length === 0) {
                $('.wrap').prepend('<div class="BCM-notice-container"></div>');
            }
            $('.BCM-notice-container').html(notice);
            
            // Make it dismissible
            makeNoticeDismissible();
            
            // Clear the stored notice
            sessionStorage.removeItem('BCM_notice_type');
            sessionStorage.removeItem('BCM_notice_message');
        }
    }
    
    // Function to make notices dismissible
    function makeNoticeDismissible() {
        $('.BCM-notice').each(function() {
            const $notice = $(this);
            
            // Add dismiss button if not already present
            if (!$notice.find('.notice-dismiss').length) {
                $notice.append('<button type="button" class="notice-dismiss"><span class="screen-reader-text">Dismiss this notice.</span></button>');
            }
            
            // Add click handler
            $notice.find('.notice-dismiss').on('click', function() {
                $notice.fadeOut(100, function() {
                    $notice.remove();
                });
            });
        });
    }
});
