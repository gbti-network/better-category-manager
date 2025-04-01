<?php
/**
 * Plugin Name: Advanced Category Manager
 * Description: Advanced category management for WordPress with a clean, efficient interface for organizing post categories.
 * Version: 1.0.3
 * Author: gbti
 * Author URI: https://gbti.network
 * Contributors: gbti, Hudson Atwell
 * Text Domain: better-category-manager
 * License: GPL v3
 * Requires PHP: 7.4
 * Requires WP: 5.8
 */

if (!defined('ABSPATH')) {
    exit;
}

class BCATM_Plugin {
    public $debug_mode;

    public function __construct() {
        $this->set_constants();
        $this->set_variables();
        $this->load_textdomain();
        $this->load_dependencies();
        $this->initialize_modules();
        
        add_filter('plugin_action_links_' . plugin_basename(__FILE__), [$this, 'add_plugin_action_links']);
    }

    private function set_constants() {
        define('BCATM_PLUGIN_FILE', __FILE__);
        define('BCATM_VERSION', '1.0.3');
        define('BCATM_PLUGIN_DIR', plugin_dir_path(__FILE__));
        define('BCATM_PLUGIN_URL', plugin_dir_url(__FILE__));
        define('BCATM_LANGUAGES_DIR', BCATM_PLUGIN_DIR . 'languages');
        define('BCATM_INCLUDES_DIR', BCATM_PLUGIN_DIR . 'includes/');
        define('BCATM_ASSETS_URL', BCATM_PLUGIN_URL . 'assets/');
        define('BCATM_TEMPLATES_DIR', BCATM_PLUGIN_DIR . 'templates/');
    }

    private function set_variables() {
        $this->debug_mode = false;

        if (defined('WP_ENVIRONMENT_TYPE') && WP_ENVIRONMENT_TYPE == 'local') {
           $this->debug_mode = true;
        }
    }

    /**
     * Maybe load textdomain for WordPress versions before 4.6
     * Since WordPress 4.6, translations are automatically loaded for plugins on WordPress.org
     */
    private function load_textdomain() {
        
        add_action('init', function() {
            load_plugin_textdomain(
                'better-category-manager',
                false,
                dirname(plugin_basename(BCATM_PLUGIN_FILE)) . '/languages'
            );
        });
        
    }

    private function load_dependencies() {
        // Core classes
        require_once BCATM_INCLUDES_DIR . 'class-category-manager.php';
        require_once BCATM_INCLUDES_DIR . 'class-settings.php';
        require_once BCATM_INCLUDES_DIR . 'class-import-export.php';
        require_once BCATM_INCLUDES_DIR . 'class-ajax-handler.php';
    }

    private function initialize_modules() {
        if (is_admin()) {
            BCATM\Admin::get_instance();
            BCATM\Settings::get_instance();
            BCATM\Import_Export::get_instance();
            BCATM\Ajax_Handler::get_instance();
        }
    }

    private function get_plugin_version() {
        return BCATM_VERSION;
    }

    public function add_plugin_action_links($links) {
        $settings_link = '<a href="' . admin_url('admin.php?page=BCATM-settings') . '">' . esc_html__('Settings', 'better-category-manager') . '</a>';
        array_unshift($links, $settings_link);
        return $links;
    }
}

$BCATM = new BCATM_Plugin();

global $BCATM;