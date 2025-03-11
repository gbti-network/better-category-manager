<?php
// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="BCM-control-group BCM-import-export-controls">
    <button type="button" class="button" id="BCM-export-taxonomies">
        <span class="dashicons dashicons-download"></span>
        <?php esc_html_e('Export','better-category-manager'); ?>
    </button>
    <div class="BCM-import-wrapper">
        <input type="file" id="BCM-import-file" accept=".json" style="display: none;">
        <button type="button" class="button" id="BCM-import-taxonomies">
            <span class="dashicons dashicons-upload"></span>
            <?php esc_html_e('Import','better-category-manager'); ?>
        </button>
    </div>
</div>
