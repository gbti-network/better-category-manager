<?php
/**
 * Main admin page template for BCM Category Manager
 *
 * @package BCM
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Get the current category object
$current_category = $this->get_current_category_object();
$current_category_name = $this->get_current_category();
?>
    <div class="wrap">
        <h1 class="wp-heading-inline">
            <?php echo esc_html__('Category Manager', 'better-category-manager'); ?>
            <?php if ($current_category && $current_category->name !== 'category'): ?>
                - <?php echo esc_html($current_category->labels->name); ?>
            <?php endif; ?>
        </h1>

        <div class="BCM-import-export-controls">
            <button type="button" class="page-title-action" id="BCM-export-taxonomies">
                <span class="dashicons dashicons-media-archive"></span>
                <?php esc_html_e('Export Terms','better-category-manager'); ?>
            </button>
            <div class="BCM-import-wrapper">
                <input type="file" id="BCM-import-file" accept=".json" style="display: none;">
                <button type="button" class="page-title-action" id="BCM-import-taxonomies">
                    <span class="dashicons dashicons-download"></span>
                    <?php esc_html_e('Import Terms','better-category-manager'); ?>
                </button>
            </div>
            <a href="<?php echo esc_url(admin_url('edit-tags.php?taxonomy=category')); ?>" class="page-title-action" title="<?php esc_attr_e('WordPress Native Categories', 'better-category-manager'); ?>">
                <span class="dashicons dashicons-backup"></span>
            </a>
            <a href="<?php echo esc_url(admin_url('options-general.php?page=BCM-settings')); ?>" class="page-title-action" title="<?php esc_attr_e('Settings', 'better-category-manager'); ?>">
                <span class="dashicons dashicons-admin-generic"></span>
            </a>
        </div>
        <hr class="wp-header-end">

        <!-- Notification Banner System -->
        <div id="BCM-notification-container" class="BCM-notification-container">
            <!-- Notifications will appear here -->
        </div>

        <?php if (!$this->is_api_key_configured()): ?>
            <div class="notice notice-warning is-dismissible">
                <p>
                    <?php esc_html_e('OpenAI API key is not configured. Some features will be disabled.','better-category-manager'); ?>
                    <a href="<?php echo esc_url(admin_url('options-general.php?page=BCM-settings')); ?>">
                        <?php esc_html_e('Configure now','better-category-manager'); ?>
                    </a>
                </p>
            </div>
        <?php endif; ?>

        <div class="BCM-category-controls">
           

            <!-- Search Box -->
            <div class="BCM-control-group">
                <label for="term-search" class="screen-reader-text">
                    <?php esc_html_e('Search Terms','better-category-manager'); ?>
                </label>
                <input type="search" id="term-search"
                       placeholder="<?php esc_attr_e('Search terms...','better-category-manager'); ?>">
               
            </div>

             <!-- Category Selector -->
             <div class="BCM-control-group">
                 <!-- Expand/Collapse Controls -->
                 <div class="BCM-tree-controls">
                    <button type="button" class="button BCM-collapse-all" title="<?php esc_attr_e('Collapse All Terms','better-category-manager'); ?>">
                        <?php esc_html_e('Collapse All','better-category-manager'); ?>
                    </button>
                    <button type="button" class="button BCM-expand-all" title="<?php esc_attr_e('Expand All Terms','better-category-manager'); ?>">
                        <?php esc_html_e('Expand All','better-category-manager'); ?>
                    </button>
                </div>
                <button type="button" class="button button-primary" id="add-new-term">
                    <?php esc_html_e('Add New Term','better-category-manager'); ?>
                </button>
            </div>
        </div>

        <div class="BCM-main-container">

            <!-- Terms Tree View -->
            <div class="BCM-terms-tree">
                
                <div class="BCM-loading-overlay hidden">
                    <span class="spinner is-active"></span>
                </div>
                <div id="category-terms-tree"></div>
            </div>

            <!-- Term Editor Sidebar -->
            <div class="BCM-term-editor hidden">
                <div class="BCM-term-editor-header">
                    <h2><?php esc_html_e('Edit Term','better-category-manager'); ?></h2>
                    <button type="button" class="BCM-close-editor">
                        <span class="screen-reader-text"><?php esc_html_e('Close','better-category-manager'); ?></span>
                        <span class="dashicons dashicons-no-alt"></span>
                    </button>
                </div>

                <div class="BCM-term-editor-content">
                    <!-- Term edit form will be loaded here dynamically -->
                </div>
            </div>
        </div>
    </div>

<?php
// Load the required WordPress color picker scripts and styles
wp_enqueue_style('wp-color-picker');
wp_enqueue_script('wp-color-picker');
?>