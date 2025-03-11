<?php

namespace BCM\Utilities;

class Usage_Tracking {
    private $product_name;
    private $plugin_version;

    public function __construct($product_name, $plugin_version) {
        $this->product_name = $product_name;
        $this->plugin_version = $plugin_version;

        // Register activation and deactivation hooks
        register_activation_hook(BCM_PLUGIN_FILE, array($this, 'activate'));
        register_deactivation_hook(BCM_PLUGIN_FILE, array($this, 'deactivate'));

        // Schedule weekly ping
        add_action('init', array($this, 'schedule_weekly_ping'));
        add_action('better_category_manager_weekly_ping_event', array($this, 'send_weekly_ping'));
    }

    public function activate() {
        global $BCM;
        if ($BCM->logs) {
            $BCM->logs->info('Plugin activation detected - sending usage data...', 'usage');
        }

        $additional_data = array(
            'plugin_version' => $this->plugin_version,
            'php_version' => PHP_VERSION,
            'wp_version' => get_bloginfo('version')
        );
        $this->send_product_event('activated', $additional_data);
    }

    public function deactivate() {
        global $BCM;
        if ($BCM->logs) {
            $BCM->logs->info('Plugin deactivation detected - sending usage data...', 'usage');
        }

        $additional_data = array(
            'plugin_version' => $this->plugin_version,
            'wp_version' => get_bloginfo('version')
        );
        $this->send_product_event('deactivated', $additional_data);

        // Clear the scheduled ping event
        wp_clear_scheduled_hook('better_category_manager_weekly_ping_event');
    }

    public function schedule_weekly_ping() {
        if (!wp_next_scheduled('better_category_manager_weekly_ping_event')) {
            wp_schedule_event(time(), 'weekly', 'better_category_manager_weekly_ping_event');
        }
    }

    public function send_weekly_ping() {
        $additional_data = array(
            'plugin_version' => $this->plugin_version,
            'wp_version' => get_bloginfo('version')
        );
        $this->send_product_event('ping', $additional_data);
    }

    public function send_product_event($type, $additional_data = array()) {
        global $BCM;

        $api_url = BCM_GBTI_API_SERVER . 'github-product-manager/v1/product-events';

        if ($BCM->logs) {
            $BCM->logs->info("Preparing to send product event: {$type}", 'usage');
            $BCM->logs->info("API URL: {$api_url}", 'usage');
        }

        $allowed_types = array('activated', 'ping', 'deactivated');
        if (!in_array($type, $allowed_types)) {
            if ($BCM->logs) {
                $BCM->logs->info('Invalid event type: ' . $type, 'usage');
            }
            return false;
        }

        $additional_data['domain'] = wp_parse_url(get_site_url(), PHP_URL_HOST);

        $body = array(
            'product' => $this->product_name,
            'type' => $type,
            'domain' => $additional_data['domain'],
            'data' => $additional_data
        );

        if ($BCM->logs) {
            $BCM->logs->info('Request body: ' . json_encode($body), 'usage');
        }

        $sslverify = true;
        if (defined('WP_ENVIRONMENT_TYPE') && WP_ENVIRONMENT_TYPE === 'local') {
            $sslverify = false;
            if ($BCM->logs) {
                $BCM->logs->info('Local environment detected - SSL verification disabled', 'usage');
            }
        }

        $args = array(
            'body' => json_encode($body),
            'headers' => array(
                'Content-Type' => 'application/json',
                'User-Agent' => 'github-product-callback'
            ),
            'timeout' => 30,
            'sslverify' => $sslverify
        );

        if ($BCM->logs) {
            $BCM->logs->info('Sending request to API...', 'usage');
        }

        $response = wp_remote_post($api_url, $args);

        if (is_wp_error($response)) {
            if ($BCM->logs) {
                $BCM->logs->info('Failed to send product event: ' . $response->get_error_message(), 'usage');
                $BCM->logs->info('Error code: ' . $response->get_error_code(), 'usage');
            }
            return false;
        }

        $response_code = wp_remote_retrieve_response_code($response);
        $response_body = wp_remote_retrieve_body($response);

        if ($BCM->logs) {
            $BCM->logs->info("API Response code: {$response_code}", 'usage');
            $BCM->logs->info("API Response body: {$response_body}", 'usage');
        }

        if ($response_code !== 200) {
            if ($BCM->logs) {
                $BCM->logs->info('Unexpected response when sending product event: ' . $response_code . ' ' . $response_body, 'usage');
            }
            return false;
        }

        if ($BCM->logs) {
            $BCM->logs->info("Successfully sent {$type} event", 'usage');
        }

        return true;
    }

    private function generate_site_id() {
        $site_id = get_option('BCM_site_id');
        if (!$site_id) {
            $site_id = wp_hash(site_url() . time());
            update_option('BCM_site_id', $site_id);
        }
        return $site_id;
    }
}
