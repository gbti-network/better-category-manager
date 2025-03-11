jQuery(document).ready(function($) {
    // Export functionality
    $('#BCM-export-taxonomies').on('click', function() {
        const currentCategory = $('#category-select').val();
        
        $.ajax({
            url: gbtiData.ajaxurl,
            type: 'POST',
            data: {
                action: 'BCM_export_taxonomies',
                nonce: gbtiData.nonce,
                category: currentCategory
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
                } else {
                    alert(gbtiData.i18n.export_error);
                }
            },
            error: function() {
                alert(gbtiData.i18n.export_error);
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
            alert(gbtiData.i18n.invalid_file);
            return;
        }

        const formData = new FormData();
        formData.append('action', 'BCM_import_taxonomies');
        formData.append('nonce', gbtiData.nonce);
        formData.append('import_file', file);

        $.ajax({
            url: gbtiData.ajaxurl,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                if (response.success) {
                    alert(gbtiData.i18n.import_success);
                    location.reload();
                } else {
                    alert(response.data || gbtiData.i18n.import_error);
                }
            },
            error: function() {
                alert(gbtiData.i18n.import_error);
            }
        });
    });
});
