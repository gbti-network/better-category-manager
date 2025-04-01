<?php
namespace BCATM;

/**
 * Handles settings and configuration for the BCATM Category Manager
 */
class Settings {
    private static $instance = null;
    private $option_group = 'BCATM_settings';
    private $option_name = 'BCATM_settings';
    private $settings_page = 'BCATM-settings';

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
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_menu', [$this, 'add_settings_page']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_settings_assets']);
        add_filter('plugin_action_links', [$this, 'add_settings_link'], 10, 2);
        
        // AJAX handlers
        add_action('wp_ajax_bcm_validate_openai_api_key', [$this, 'ajax_validate_openai_api_key']);
    }

    /**
     * Register settings
     */
    public function register_settings() {
        // Register settings
        register_setting(
            $this->option_group,
            $this->option_name,
            [
                'type' => 'array',
                'sanitize_callback' => [$this, 'sanitize_settings'],
                'default' => $this->get_default_settings()
            ]
        );

        // General Settings Section
        add_settings_section(
            'general',
            esc_html__('General Settings', 'better-category-manager'),
            [$this, 'render_section_description'],
            $this->settings_page
        );

        // Add settings fields
        $this->add_settings_fields();
        
        // Add admin notices for API key validation
        add_action('admin_notices', [$this, 'check_openai_api_key']);
    }

    /**
     * Add settings fields to general section
     */
    private function add_settings_fields() {
        // Display settings
        add_settings_field(
            'show_post_counts',
            esc_html__('Show Count', 'better-category-manager'),
            [$this, 'render_checkbox_field'],
            $this->settings_page,
            'general',
            [
                'label_for' => 'show_post_counts',
                'description' => esc_html__('Show the number of posts for each term.', 'better-category-manager')
            ]
        );

        // OpenAI API Key
        add_settings_field(
            'openai_api_key',
            esc_html__('OpenAI API Key', 'better-category-manager'),
            [$this, 'render_password_field'],
            $this->settings_page,
            'general',
            [
                'label_for' => 'openai_api_key',
                'description' => sprintf(
                    /* translators: %1$s: opening link tag, %2$s: closing link tag */
                    esc_html__('Your OpenAI API key for generating term descriptions. %1$sGet your API key here%2$s.', 'better-category-manager'),
                    '<a href="https://platform.openai.com/api-keys" target="_blank">',
                    '</a>'
                )
            ]
        );

        // OpenAI Model
        add_settings_field(
            'openai_model',
            /* translators: %1$s: opening link tag, %2$s: closing link tag */
            esc_html__('OpenAI Model', 'better-category-manager'),
            [$this, 'render_select_field'],
            $this->settings_page,
            'general',
            [
                'label_for' => 'openai_model',
                'description' => sprintf(
                    /* translators: %1$s: opening link tag, %2$s: closing link tag */
                    esc_html__('Select the OpenAI model to use for generating term descriptions. %1$sView OpenAI pricing and available models%2$s', 'better-category-manager'),
                    '<a href="https://platform.openai.com/docs/pricing" target="_blank">',
                    '</a>'
                ),
                'options' => [
                    'gpt-3.5-turbo' => esc_html__('GPT-3.5 Turbo', 'better-category-manager'),
                    'gpt-4o-mini' => esc_html__('GPT-4o Mini', 'better-category-manager'),
                    'o3-mini' => esc_html__('O3-mini', 'better-category-manager'),
                    'gpt-4o' => esc_html__('GPT-4o', 'better-category-manager')
                ]
            ]
        );

        // Default AI Prompt
        add_settings_field(
            'default_ai_prompt',
            esc_html__('Default AI Prompt', 'better-category-manager'),
            [$this, 'render_textarea_field'],
            $this->settings_page,
            'general',
            [
                'label_for' => 'default_ai_prompt',
                'description' => esc_html__('Default prompt for generating term descriptions with AI. Include [TERM_NAME] where the term name should be inserted.', 'better-category-manager')
            ]
        );
    }

    /**
     * Add settings page to admin menu
     */
    public function add_settings_page() {
        add_submenu_page(
            'options-general.php',
            esc_html__('Category Manager', 'better-category-manager'),
            esc_html__('Category Manager', 'better-category-manager'),
            'manage_options',
            $this->settings_page,
            [$this, 'render_settings_page']
        );
    }

    /**
     * Enqueue scripts and styles for the settings page
     */
    public function enqueue_settings_assets($hook) {
        if ($hook !== 'settings_page_BCATM-settings') {
            return;
        }

        // Styles
        wp_enqueue_style('BCATM-settings-css', BCATM_PLUGIN_URL . 'assets/css/settings.css', [], BCATM_VERSION);
        wp_enqueue_style('dashicons');

        // Scripts
        wp_enqueue_script('BCATM-utils', BCATM_PLUGIN_URL . 'assets/js/utils.js', ['jquery'], BCATM_VERSION, true);
        wp_enqueue_script('BCATM-settings-js', BCATM_PLUGIN_URL . 'assets/js/settings.js', ['jquery'], BCATM_VERSION, true);
        
        wp_localize_script('BCATM-settings-js', 'BCATM_Settings', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('BCATM_settings_nonce'),
            'strings' => [
                'deleteConfirm' => esc_html__('Are you sure you want to delete this token?', 'better-category-manager'),
                'tokenDeleted' => esc_html__('Token deleted successfully.', 'better-category-manager'),
                'tokenError' => esc_html__('Error deleting token. Please try again.', 'better-category-manager'),
                'validatingApiKey' => esc_html__('Validating API key...', 'better-category-manager'),
                'connectionError' => esc_html__('Error connecting to server. Please try again.', 'better-category-manager')
            ]
        ]);
    }

    /**
     * Add settings link to plugins page
     */
    public function add_settings_link($links, $file) {
        if (plugin_basename(BCATM_PLUGIN_FILE) === $file) {
            $settings_link = '<a href="' . admin_url('admin.php?page=' . $this->settings_page) . '">' . esc_html__('Settings', 'better-category-manager') . '</a>';
            array_unshift($links, $settings_link);
        }
        return $links;
    }

    /**
     * Render settings page
     */
    public function render_settings_page() {
        ?>
        <div class="bcm-settings-wrap">
            <!-- Header Banner -->
            <div class="bcm-header-banner">
                <div class="bcm-logo-container">
                    <h1><?php echo esc_html__('Advanced Category Manager', 'Advanced-category-manager'); ?></h1>
                </div>
            </div>

            <!-- Content Area -->
            <div class="bcm-content-area">
                <!-- Welcome Section -->
                <div class="bcm-section bcm-welcome-section">
                    <h2><?php echo esc_html__('Welcome to Advanced Category Manager', 'better-category-manager'); ?></h2>
                    <p><?php echo esc_html__('Advanced Category Manager integrates seamlessly with your WordPress site to provide an enhanced category management experience. Use the settings below to customize your experience.', 'better-category-manager'); ?></p>
                </div>

                <!-- Features Section -->
                <div class="bcm-section bcm-features-section">
                    <h2><?php echo esc_html__('Key Features', 'better-category-manager'); ?></h2>
                    <ul class="bcm-features-list">
                        <li class="bcm-feature-item">
                            <span class="dashicons dashicons-yes bcm-feature-icon"></span>
                            <span class="bcm-feature-text"><?php echo esc_html__('Easy child nesting for creating hierarchical category structures.', 'better-category-manager'); ?></span>
                        </li>
                        <li class="bcm-feature-item">
                            <span class="dashicons dashicons-yes bcm-feature-icon"></span>
                            <span class="bcm-feature-text"><?php echo esc_html__('Quick editing of category names, slugs, and descriptions.', 'better-category-manager'); ?></span>
                        </li>
                        <li class="bcm-feature-item">
                            <span class="dashicons dashicons-yes bcm-feature-icon"></span>
                            <span class="bcm-feature-text"><?php echo esc_html__('OpenAI integrations for generating category descriptions automatically.', 'better-category-manager'); ?></span>
                        </li>
                    </ul>
                </div>

                <!-- Settings Section -->
                <div class="bcm-section bcm-settings-section">
                    <form method="post" action="options.php">
                        <?php
                        settings_fields('BCATM_settings');
                        do_settings_sections('BCATM-settings');
                        submit_button();
                        ?>
                    </form>
                </div>

                <!-- Pro Features Section -->
                <div class="bcm-section bcm-pro-features-section">
                    <h2><?php echo esc_html__('Upgrade to a Advanced Taxonomy Manager', 'better-category-manager'); ?></h2>
                    <p><?php echo esc_html__('Experience advanced features with Advanced Taxonomy Manager, the premium version of this plugin:', 'better-category-manager'); ?></p>
                    
                    <ul class="bcm-features-list">
                        <li class="bcm-feature-item bcm-locked">
                            <span class="dashicons dashicons-lock bcm-feature-icon"></span>
                            <span class="bcm-feature-text"><?php echo esc_html__('Manage all taxonomies, not just categories', 'better-category-manager'); ?></span>
                        </li>
                        <li class="bcm-feature-item bcm-locked">
                            <span class="dashicons dashicons-lock bcm-feature-icon"></span>
                            <span class="bcm-feature-text"><?php echo esc_html__('Import/export taxonomy structures', 'better-category-manager'); ?></span>
                        </li>
                    </ul>

                    <div class="bcm-sponsor-box">
                        <h3><?php echo esc_html__('Get Advanced Taxonomy Manager', 'better-category-manager'); ?></h3>
                        <p><?php echo esc_html__('Join the GBTI Network and get access to Advanced Taxonomy Manager.', 'better-category-manager'); ?></p>
                        <button class="button bcm-become-sponsor">
                            <span class="dashicons dashicons-heart"></span>
                            <?php echo esc_html__('Join the GBTI Network', 'better-category-manager'); ?>
                        </button>
                    </div>
                </div>

                <!-- Rating Section -->
                <div class="bcm-section bcm-rating-section">
                    <div class="bcm-stars">
                        <span class="dashicons dashicons-star-filled"></span>
                        <span class="dashicons dashicons-star-filled"></span>
                        <span class="dashicons dashicons-star-filled"></span>
                        <span class="dashicons dashicons-star-filled"></span>
                        <span class="dashicons dashicons-star-filled"></span>
                    </div>
                    <h3><?php echo esc_html__('Enjoying Advanced Category Manager?', 'better-category-manager'); ?></h3>
                    <p><?php echo esc_html__('Please consider leaving a 5-star review. It helps others discover this plugin and motivates us to keep improving it.', 'better-category-manager'); ?></p>
                    <button class="button bcm-write-review">
                        <?php echo esc_html__('Write a Review', 'better-category-manager'); ?>
                    </button>
                </div>

                <!-- Support Section -->
                <div class="bcm-section bcm-support-section">
                    <div class="bcm-support-buttons">
                        <a href="#" class="button bcm-raise-issue">
                            <span class="dashicons dashicons-warning"></span>
                            <?php echo esc_html__('Report an Issue', 'better-category-manager'); ?>
                        </a>
                        <a href="#" class="button bcm-request-customization">
                            <span class="dashicons dashicons-admin-customizer"></span>
                            <?php echo esc_html__('Request a Feature', 'better-category-manager'); ?>
                        </a>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * Render section description
     */
    public function render_section_description($section) {
        if ($section['id'] === 'general') {
            echo '<p>' . esc_html__('Configure how categories should be displayed in the editor.', 'better-category-manager') . '</p>';
        }
    }

    /**
     * Render checkbox field
     */
    public function render_checkbox_field($args) {
        $option_name = $args['label_for'];
        $description = $args['description'] ?? '';
        $settings = get_option($this->option_name, $this->get_default_settings());
        $value = isset($settings[$option_name]) ? $settings[$option_name] : 0;
        ?>
        <!-- Hidden field to ensure the setting exists in POST data even when checkbox is unchecked -->
        <input type="hidden" name="<?php echo esc_attr($this->option_name); ?>[<?php echo esc_attr($option_name); ?>]" value="0">
        <input type="checkbox" id="<?php echo esc_attr($option_name); ?>" 
               name="<?php echo esc_attr($this->option_name); ?>[<?php echo esc_attr($option_name); ?>]" 
               value="1" <?php checked(1, $value); ?>>
        <?php if (!empty($description)) : ?>
            <p class="description"><?php echo esc_html($description); ?></p>
        <?php endif; ?>
        <?php
    }

    /**
     * Render password field
     */
    public function render_password_field($args) {
        $option_name = $args['label_for'];
        $description = $args['description'] ?? '';
        $settings = get_option($this->option_name, $this->get_default_settings());
        $value = isset($settings[$option_name]) ? $settings[$option_name] : '';
        ?>
        <input type="password" 
               id="<?php echo esc_attr($option_name); ?>" 
               name="<?php echo esc_attr($this->option_name); ?>[<?php echo esc_attr($option_name); ?>]"
               value="<?php echo esc_attr($value); ?>"
               class="regular-text"
               autocomplete="off">
        <button type="button" class="button" id="validate-api-key">
            <?php esc_html_e('Validate Key', 'better-category-manager'); ?>
        </button>
        <span id="api-key-validation-result"></span>
        <?php if (!empty($description)) : ?>
            <p class="description"><?php echo wp_kses($description, [
                'a' => [
                    'href' => [],
                    'target' => [],
                    'rel' => []
                ]
            ]); ?></p>
        <?php endif; ?>
        <?php
    }

    /**
     * Render select field
     */
    public function render_select_field($args) {
        $option_name = $args['label_for'];
        $description = $args['description'] ?? '';
        $options = $args['options'] ?? [];
        $settings = get_option($this->option_name, $this->get_default_settings());
        $value = isset($settings[$option_name]) ? $settings[$option_name] : '';
        ?>
        <select id="<?php echo esc_attr($option_name); ?>" 
                name="<?php echo esc_attr($this->option_name); ?>[<?php echo esc_attr($option_name); ?>]">
            <?php foreach ($options as $key => $label) : ?>
                <option value="<?php echo esc_attr($key); ?>" <?php selected($key, $value); ?>>
                    <?php echo esc_html($label); ?>
                </option>
            <?php endforeach; ?>
        </select>
        <?php if (!empty($description)) : ?>
            <p class="description"><?php echo wp_kses($description, [
                'a' => [
                    'href' => [],
                    'target' => [],
                    'rel' => []
                ]
            ]); ?></p>
        <?php endif; ?>
        <?php
    }

    /**
     * Render textarea field
     */
    public function render_textarea_field($args) {
        $option_name = $args['label_for'];
        $description = $args['description'] ?? '';
        $settings = get_option($this->option_name, $this->get_default_settings());
        $value = isset($settings[$option_name]) ? $settings[$option_name] : '';
        ?>
        <textarea id="<?php echo esc_attr($option_name); ?>" 
                  name="<?php echo esc_attr($this->option_name); ?>[<?php echo esc_attr($option_name); ?>]" 
                  rows="5" cols="50" class="large-text"><?php echo esc_textarea($value); ?></textarea>
        <?php if (!empty($description)) : ?>
            <p class="description"><?php echo esc_html($description); ?></p>
        <?php endif; ?>
        <?php
    }

    /**
     * Get all public taxonomies with UI
     * 
     * @return array Array of category objects
     */
    public function get_public_taxonomies() {
        $taxonomies = get_taxonomies([
            'public' => true,
            'show_ui' => true,
        ], 'objects');
        
        return $taxonomies;
    }

    public function get_default_category() {
        return 'category';
    }

    public function get_items_per_page() {
        return 100;
    }

    public function should_show_count() {
        $settings = get_option($this->option_name, $this->get_default_settings());
        return isset($settings['show_post_counts']) ? (bool) $settings['show_post_counts'] : true;
    }

    /**
     * Check OpenAI API key and show admin notice if needed
     */
    public function check_openai_api_key() {
        // Only show on our settings page
        $screen = get_current_screen();
        if (!$screen || $screen->id !== 'settings_page_' . $this->settings_page) {
            return;
        }

    }

    /**
     * AJAX handler for validating OpenAI API key
     */
    public function ajax_validate_openai_api_key() {
        // Check nonce for security
        check_ajax_referer('BCATM_settings_nonce', 'nonce');

        // Check if API key is provided
        if (!isset($_POST['api_key']) || empty($_POST['api_key'])) {
            wp_send_json_error([
                'message' => esc_html__('API key is required.', 'better-category-manager')
            ]);
        }

        $api_key = sanitize_text_field(wp_unslash($_POST['api_key']));
        
        // Generate a unique transient name based on the API key
        $transient_name = 'bcatm_api_key_validation_' . md5($api_key);
        
        // Check if we have a cached validation result
        $cached_result = get_transient($transient_name);
        if ($cached_result !== false) {
            if ($cached_result === 'valid') {
                wp_send_json_success([
                    'message' => esc_html__('API key is valid! (cached)', 'better-category-manager'),
                    'cached' => true
                ]);
            } else {
                wp_send_json_error([
                    'message' => $cached_result,
                    'cached' => true
                ]);
            }
            return;
        }

        // Make a test request to OpenAI API
        $response = wp_remote_post('https://api.openai.com/v1/chat/completions', [
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode([
                'model' => $this->get_openai_model(),
                'messages' => [
                    [
                        'role' => 'system',
                        'content' => 'You are a helpful assistant.'
                    ],
                    [
                        'role' => 'user',
                        'content' => 'Test'
                    ]
                ],
                'max_tokens' => 5
            ]),
            'timeout' => 15,
            'sslverify' => true,
        ]);

        // Check for errors in the response
        if (is_wp_error($response)) {
            $error_message = esc_html__('Connection error: ', 'better-category-manager') . esc_html($response->get_error_message());
            // Cache the error for 30 minutes
            set_transient($transient_name, $error_message, 30 * MINUTE_IN_SECONDS);
            
            wp_send_json_error([
                'message' => $error_message
            ]);
        }

        $status_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        // Check if the request was successful based on HTTP status code
        if ($status_code === 200) {
            // Cache the successful result for 30 minutes
            set_transient($transient_name, 'valid', 30 * MINUTE_IN_SECONDS);
            
            wp_send_json_success([
                'message' => esc_html__('API key is valid!', 'better-category-manager')
            ]);
        } else {
            // Format error message from OpenAI
            $error_message = '';
            if (!empty($data['error']['message'])) {
                $error_message = esc_html($data['error']['message']);
            } else {
                $error_message = esc_html__('Invalid API key or API error.', 'better-category-manager');
            }
            
            // Cache the error for 30 minutes
            set_transient($transient_name, $error_message, 30 * MINUTE_IN_SECONDS);

            wp_send_json_error([
                'message' => $error_message,
                'status' => $status_code
            ]);
        }
    }

    /**
     * Get default settings
     */
    public function get_default_settings() {
        return [
            'show_post_counts' => true,
            'openai_api_key' => '',
            'openai_model' => 'gpt-3.5-turbo',
            'default_ai_prompt' => $this->get_default_ai_prompt()
        ];
    }

    /**
     * Sanitize settings
     * 
     * @param array $input The input array to sanitize
     * @return array Sanitized settings
     */
    public function sanitize_settings($input) {
        $sanitized = [];
        
        // Boolean settings
        $sanitized['show_post_counts'] = isset($input['show_post_counts']) ? (bool) $input['show_post_counts'] : true;
        
        // Text fields - ensure proper sanitization and handle missing values
        $sanitized['openai_api_key'] = isset($input['openai_api_key']) ? sanitize_text_field(wp_unslash($input['openai_api_key'])) : '';
        $sanitized['openai_model'] = isset($input['openai_model']) ? sanitize_text_field(wp_unslash($input['openai_model'])) : 'gpt-3.5-turbo';
        $sanitized['default_ai_prompt'] = isset($input['default_ai_prompt']) ? sanitize_textarea_field(wp_unslash($input['default_ai_prompt'])) : '';
        
        return $sanitized;
    }

    /**
     * Get OpenAI API key
     */
    public function get_openai_api_key() {
        $settings = get_option($this->option_name, $this->get_default_settings());
        return isset($settings['openai_api_key']) ? $settings['openai_api_key'] : '';
    }

    /**
     * Get OpenAI model
     */
    public function get_openai_model() {
        $settings = get_option($this->option_name, $this->get_default_settings());
        return isset($settings['openai_model']) ? $settings['openai_model'] : 'gpt-3.5-turbo';
    }

    /**
     * Get default AI prompt
     */
    public function get_default_ai_prompt() {
        $settings = get_option($this->option_name);
        
        // Return from settings if exists
        if ($settings && isset($settings['default_ai_prompt'])) {
            return $settings['default_ai_prompt'];
        }
        
        // Default value when not yet set in options
        return esc_html__('Write a clear and concise description for the [TERM_NAME] category, explaining its purpose and how it helps organize content.', 'better-category-manager');
    }

    /**
     * Utility methods
     */
    public function get_managed_taxonomies() {
        $settings = get_option($this->option_name, $this->get_default_settings());
        $managed_taxonomy_names = [];
        $taxonomies = [];
        
        foreach ($managed_taxonomy_names as $name) {
            $taxonomy = get_taxonomy($name);
            if ($taxonomy) {
                $taxonomies[$name] = $taxonomy;
            }
        }
        
        return $taxonomies;
    }
}