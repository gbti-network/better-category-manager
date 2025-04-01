<?php
// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="BCATM-control-group BCATM-import-export-controls">
    <button type="button" class="button" id="BCATM-export-taxonomies">
        <span class="dashicons dashicons-download"></span>
        <?php esc_html_e('Export','better-category-manager'); ?>
    </button>
    <div class="BCATM-import-wrapper">
        <input type="file" id="BCATM-import-file" accept=".json" style="display: none;">
        <button type="button" class="button" id="BCATM-import-taxonomies">
            <span class="dashicons dashicons-upload"></span>
            <?php esc_html_e('Import','better-category-manager'); ?>
        </button>
    </div>
</div>
