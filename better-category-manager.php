<?php
/**
 * Plugin Name: Better Category Manager
 * Description: Advanced category management for WordPress with a clean, efficient interface for organizing post categories.
 * Version: 1.0.0
 * Author: GBTI
 * Author URI: https://gbti.network
 * Contributors: GBTI, Hudson Atwell
 * Text Domain: better-category-manager
 * License: GPL v3
 * Requires PHP: 7.4
 * Requires WP: 5.8
 */

if (!defined('ABSPATH')) {
    exit;
}

class BCM_Plugin {
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
        define('BCM_PLUGIN_FILE', __FILE__);
        define('BCM_VERSION', '1.0.0');
        define('BCM_PLUGIN_DIR', plugin_dir_path(__FILE__));
        define('BCM_PLUGIN_URL', plugin_dir_url(__FILE__));
        define('BCM_LANGUAGES_DIR', BCM_PLUGIN_DIR . 'languages');
        define('BCM_INCLUDES_DIR', BCM_PLUGIN_DIR . 'includes/');
        define('BCM_ASSETS_URL', BCM_PLUGIN_URL . 'assets/');
        define('BCM_TEMPLATES_DIR', BCM_PLUGIN_DIR . 'templates/');
    }

    private function set_variables() {
        $this->debug_mode = false;

        if (defined('WP_ENVIRONMENT_TYPE') && WP_ENVIRONMENT_TYPE == 'local') {
           $this->debug_mode = true;
        }
    }

    private function load_textdomain() {
        load_plugin_textdomain(
            'better-category-manager',
            false,
            dirname(plugin_basename(BCM_PLUGIN_FILE)) . '/languages'
        );
    }

    private function load_dependencies() {
        // Core classes
        require_once BCM_INCLUDES_DIR . 'class-category-manager.php';
        require_once BCM_INCLUDES_DIR . 'class-settings.php';
        require_once BCM_INCLUDES_DIR . 'class-import-export.php';
        require_once BCM_INCLUDES_DIR . 'class-ajax-handler.php';
    }

    private function initialize_modules() {
        if (is_admin()) {
            BCM\Admin::get_instance();
            BCM\Settings::get_instance();
            BCM\Import_Export::get_instance();
            BCM\Ajax_Handler::get_instance();
        }
    }

    private function get_plugin_version() {
        return BCM_VERSION;
    }

    public function add_plugin_action_links($links) {
        $settings_link = '<a href="' . admin_url('admin.php?page=BCM-settings') . '">' . esc_html__('Settings', 'better-category-manager') . '</a>';
        array_unshift($links, $settings_link);
        return $links;
    }
}

$BCM = new BCM_Plugin();

global $BCM;