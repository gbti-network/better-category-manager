<?php
namespace BCM;

use BCM\Settings;

/**
 * Handles admin interface functionality for the BCM Category Manager
 */
class Admin {
    private static $instance = null;
    private $current_category = null;

    /**
     * Get singleton instance
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        // Use a late priority to ensure this runs after WordPress adds its default menus
        add_action('admin_menu', [$this, 'register_admin_menu'], 99);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_assets']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_menu_styles_scripts']);
    }
    
    /**
     * Register the admin menu and submenus
     */
    public function register_admin_menu() {
        // Add a hidden page for the manager that's accessible via edit.php?page=BCM-manager
        add_submenu_page(
            null,
            esc_html__('Category Manager', 'better-category-manager'),
            esc_html__('Category Manager', 'better-category-manager'),
            'manage_categories',
            'BCM-manager',
            [$this, 'render_admin_page']
        );

        // Use the global $submenu variable to replace the native categories menu link
        global $submenu;
        if (isset($submenu['edit.php'])) {
            // Find the categories submenu item by checking the slug (third element in array)
            foreach ($submenu['edit.php'] as $key => $item) {
                if (isset($item[2]) && $item[2] === 'edit-tags.php?taxonomy=category') {
                    // Replace the URL with our custom page
                    $submenu['edit.php'][$key][2] = 'edit.php?page=BCM-manager';
                    break;
                }
            }
        }
    }
    
    /**
     * Enqueue admin assets
     */
    public function enqueue_admin_assets($hook) {

        // Also check our direct access page
        if ($hook !== 'posts_page_BCM-manager') {
            return;
        }
        
        // Enqueue CSS
        wp_enqueue_style(
            'BCM-admin-style',
            BCM_ASSETS_URL . 'css/category-editor.css',
            [],
            BCM_VERSION
        );

        wp_enqueue_style(
            'BCM-import-export-style',
            BCM_ASSETS_URL . 'css/import-export.css',
            [],
            BCM_VERSION
        );

        // Enqueue loader CSS
        wp_enqueue_style(
            'BCM-loader',
            BCM_ASSETS_URL . 'css/loader.css',
            [],
            BCM_VERSION
        );

        // Enqueue JavaScript
        wp_enqueue_script(
            'BCM-utils',
            BCM_ASSETS_URL . 'js/utils.js',
            ['jquery'],
            BCM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'BCM-logging',
            BCM_ASSETS_URL . 'js/debug.js',
            ['jquery', 'BCM-utils'],
            BCM_VERSION,
            true
        );

        // Ensure jQuery UI Sortable is loaded
        wp_enqueue_script('jquery-ui-sortable');

        // Enqueue JavaScript with wp-util dependency
        wp_enqueue_script(
            'BCM-admin-script',
            BCM_ASSETS_URL . 'js/category-manager.js',
            ['jquery', 'wp-util', 'BCM-utils', 'BCM-logging', 'jquery-ui-sortable'],
            BCM_VERSION,
            true
        );

        wp_enqueue_script(
            'BCM-import-export-script',
            BCM_ASSETS_URL . 'js/import-export.js',
            ['jquery', 'BCM-utils'],
            BCM_VERSION,
            true
        );

        // Localize scripts
        wp_localize_script('BCM-import-export-script', 'BCMData', [
            'nonce' => wp_create_nonce('BCM_nonce'),
            'ajaxurl' => admin_url('admin-ajax.php'),
            'i18n' => [
                'export_success' => esc_html__('Export completed successfully.','better-category-manager'),
                'export_error' => esc_html__('Export failed. Please try again.','better-category-manager'),
                'import_success' => esc_html__('Import completed successfully.','better-category-manager'),
                'import_error' => esc_html__('Import failed. Please try again.','better-category-manager'),
                'invalid_file' => esc_html__('Please select a valid JSON file.','better-category-manager')
            ]
        ]);

        // Localize admin script
        wp_localize_script('BCM-admin-script', 'BCMAdmin', [
            'ajax_url' => admin_url('admin-ajax.php'),
            'adminUrl' => admin_url(),
            'nonce' => wp_create_nonce('BCM_nonce'),
            'has_api_key' => $this->is_api_key_configured(),
            'settings' => get_option('BCM_settings', []),
            'default_ai_prompt' => Settings::get_instance()->get_default_ai_prompt(),
            'i18n' => [
                'save_success' => esc_html__('Category updated successfully.', 'better-category-manager'),
                'save_error' => esc_html__('Error saving category.', 'better-category-manager'),
                'confirm_delete' => esc_html__('Are you sure you want to delete this category?', 'better-category-manager'),
                'loading' => esc_html__('Loading...', 'better-category-manager'),
                'error_loading' => esc_html__('Error loading categories.', 'better-category-manager'),
                'no_terms' => esc_html__('No categories found.', 'better-category-manager'),
                'create_term' => esc_html__('Create Category', 'better-category-manager'),
                'edit_term' => esc_html__('Edit Category', 'better-category-manager'),
                'unsaved_changes' => esc_html__('There are unsaved changes. Do you want to discard them?', 'better-category-manager'),
                'term_updated' => esc_html__('Term updated successfully.', 'better-category-manager'),
                'delete_error' => esc_html__('Error deleting term.', 'better-category-manager'),
                'delete_failed' => esc_html__('Failed to delete category.', 'better-category-manager'),
                'term_deleted' => esc_html__('has been deleted', 'better-category-manager'),
                'delete_term' => esc_html__('Delete this term', 'better-category-manager'),
                'click_confirm_delete' => esc_html__('Click again to confirm deletion', 'better-category-manager'),
                'confirm_deletion' => esc_html__('Confirm Deletion', 'better-category-manager'),
                'generate_error' => esc_html__('Error generating description.', 'better-category-manager'),
                'api_key_missing' => esc_html__('OpenAI API key is not configured. Please configure it in the settings.', 'better-category-manager'),
                'hierarchy_update_error' => esc_html__('Error updating term hierarchy.', 'better-category-manager')
            ]
        ]);
    }

    /**
     * Enqueue menu-specific styles and scripts
     * 
     * @param string $hook The current admin page
     */
    public function enqueue_menu_styles_scripts($hook) {

        // Also check our direct access page
        if ($hook !== 'posts_page_BCM-manager') {
            return;
        }
        
        // Get plugin directory URL for asset loading
        $plugin_url = plugin_dir_url(dirname(__FILE__));
        
        // Register and enqueue menu highlight styles
        wp_register_style(
            'bcm-menu-highlight',
            $plugin_url . 'assets/css/menu-highlight.css',
            [],
            BCM_VERSION
        );
        wp_enqueue_style('bcm-menu-highlight');
        
        // Register and enqueue menu highlight script
        wp_register_script(
            'bcm-menu-highlight',
            $plugin_url . 'assets/js/menu-highlight.js',
            ['jquery'],
            BCM_VERSION,
            true
        );
        wp_enqueue_script('bcm-menu-highlight');
    }


    /**
     * Get available taxonomies for editing
     */
    private function get_available_taxonomies() {
        $settings = get_option('BCM_settings');
        $managed_taxonomies = isset($settings['taxonomies']) ? $settings['taxonomies'] : ['category'];
        
        $taxonomies = [];
        foreach ($managed_taxonomies as $taxonomy_name) {
            $taxonomy = get_taxonomy($taxonomy_name);
            if ($taxonomy) {
                $taxonomies[$taxonomy_name] = $taxonomy;
            }
        }
        
        return $taxonomies;
    }

      /**
     * Check if API key is configured
     */
    public function is_api_key_configured() {
        $settings = get_option('BCM_settings');
        return !empty($settings['openai_api_key']);
    }

    /**
     * Render the main admin page
     */
    public function render_admin_page() {
        // Check user capabilities
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have sufficient permissions to access this page.','better-category-manager'));
        }

        $taxonomies = $this->get_available_taxonomies();

        // Start output buffering
        ob_start();

        // Include the admin page template
        include BCM_TEMPLATES_DIR . 'admin-page.php';

        // Include the term modal template
        include BCM_TEMPLATES_DIR . 'term-modal.php';

        // Output the buffered content
        echo ob_get_clean();
    }

    /**
     * Get category object for current category
     */
    public function get_current_category_object() {
        $category = get_taxonomy($this->current_category);
        if (!$category) {
            return null;
        }
        return $category;
    }

    /**
     * Check if current category is hierarchical
     */
    public function is_current_category_hierarchical() {
        $category = $this->get_current_category_object();
        return $category ? $category->hierarchical : false;
    }

    /**
     * Get parent terms dropdown
     */
    public function get_parent_terms_dropdown($selected = 0, $exclude = 0) {
        if (!$this->is_current_category_hierarchical()) {
            return '';
        }

        $dropdown_args = [
            'taxonomy' => $this->current_category,
            'hide_empty' => false,
            'hierarchical' => true,
            'selected' => $selected,
            'exclude' => $exclude,
            'name' => 'parent',
            'show_option_none' => __('None', 'better-category-manager')
        ];

        return wp_dropdown_categories($dropdown_args);
    }

    /**
     * Display admin notices
     */
    public function display_admin_notice($message, $type = 'info') {
        $class = 'notice notice-' . $type;
        printf('<div class="%1$s"><p>%2$s</p></div>', esc_attr($class), wp_kses_post($message));
    }

    /**
     * Get current category name
     */
    public function get_current_category() {
        return $this->current_category;
    }
}