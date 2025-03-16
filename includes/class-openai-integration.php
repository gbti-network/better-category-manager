<?php
namespace BCM;

/**
 * Handles OpenAI API integration for the BCM Category Manager
 */
class OpenAI_Integration {
    private static $instance = null;
    private $api_key = null;
    private $api_base_url = 'https://api.openai.com/v1';
    private $model = 'gpt-3.5-turbo';

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
        $settings = Settings::get_instance();
        $this->api_key = $settings->get_openai_api_key();
        $this->model = $settings->get_openai_model();
    }

    /**
     * Generate description using OpenAI
     */
    public function generate_description($prompt, $term_name) {
        if (!$this->is_configured()) {
            throw new \Exception(esc_html__('OpenAI API key is not configured.', 'better-category-manager'));
        }

        $messages = [
            [
                'role' => 'system',
                'content' => $this->get_system_prompt()
            ],
            [
                'role' => 'user',
                'content' => $this->format_prompt($prompt, $term_name)
            ]
        ];

        $response = $this->make_api_request('chat/completions', [
            'model' => $this->model,
            'messages' => $messages,
            'temperature' => 0.7,
            'max_tokens' => 150,
            'n' => 1,
            'stop' => null
        ]);

        if (empty($response['choices'][0]['message']['content'])) {
            throw new \Exception(esc_html__('Failed to generate description.', 'better-category-manager'));
        }

        return trim($response['choices'][0]['message']['content']);
    }

    /**
     * Make API request to OpenAI
     */
    private function make_api_request($endpoint, $data) {
        $response = wp_remote_post($this->api_base_url . '/' . $endpoint, [
            'headers' => [
                'Authorization' => 'Bearer ' . $this->api_key,
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode($data),
            'timeout' => 30,
            'sslverify' => true,
        ]);

        if (is_wp_error($response)) {
            throw new \Exception(esc_html__('WP Error:', 'better-category-manager') . ' ' . esc_html($response->get_error_message()));
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \Exception(esc_html__('Invalid response from OpenAI API.', 'better-category-manager'));
        }

        if (!empty($data['error'])) {
            throw new \Exception(esc_html($data['error']['message']));
        }

        return $data;
    }

    /**
     * Format prompt for OpenAI
     */
    private function format_prompt($prompt, $term_name) {
        if (empty($prompt)) {
            $prompt = $this->get_default_prompt();
        }

        return str_replace(
            ['[TERM_NAME]', '[term_name]'],
            $term_name,
            $prompt
        );
    }

    /**
     * Get system prompt for OpenAI
     */
    private function get_system_prompt() {
        return __('You are a helpful assistant specialized in writing clear, concise category term descriptions. Keep descriptions informative but brief, typically one to two sentences. Focus on explaining the term\'s purpose and context within its category. Avoid technical jargon unless necessary.', 'better-category-manager');
    }

    /**
     * Get default prompt for OpenAI
     */
    private function get_default_prompt() {
        return __('Write a brief, clear description for the category term "[TERM_NAME]". Explain its purpose and how it helps organize content.', 'better-category-manager');
    }

    /**
     * Check if OpenAI integration is configured
     */
    public function is_configured() {
        return !empty($this->api_key);
    }
}