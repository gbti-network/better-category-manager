<?php
namespace BCM;

/**
 * Handles all AJAX requests for the BCM Category Manager
 */
class Ajax_Handler {
    private static $instance = null;
    private $nonce_key = 'BCM_nonce';

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
        $this->register_ajax_handlers();
    }

    /**
     * Register all AJAX handlers
     */
    private function register_ajax_handlers() {
        $ajax_actions = [
            'BCM_get_terms',
            'BCM_get_term_data',
            'BCM_save_term',
            'BCM_delete_term',
            'BCM_generate_description',
            'BCM_update_term_hierarchy',
            'BCM_get_parent_terms' // Add new handler for parent terms
        ];

        foreach ($ajax_actions as $action) {
            add_action("wp_ajax_$action", [$this, str_replace('BCM_', 'handle_', $action)]);
        }
    }
    /**
     * Handle getting terms
     */
    public function handle_get_terms() {
        // Verify nonce
        $this->verify_nonce();

        // Force taxonomy to be 'category' since this is the Better Category Manager
        $taxonomy = 'category';
        $search = isset($_POST['search']) ? sanitize_text_field(wp_unslash($_POST['search'])) : '';
        
        // Get settings
        $settings = get_option('BCM_settings', []);
        $show_count = isset($settings['show_count']) ? (bool) $settings['show_count'] : true;

        // Query args - always get all categories without pagination
        $args = [
            'taxonomy' => $taxonomy,
            'hide_empty' => false,
            'search' => $search,
            'orderby' => 'name',
            'order' => 'ASC',
            'fields' => 'all'
        ];

        // Get all categories
        $terms = get_terms($args);
        
        if (is_wp_error($terms)) {
            wp_send_json_error(['message' => $terms->get_error_message()]);
        }
        
        // Count total
        $total = count($terms);
        
        // Format terms as a flat list for the existing JS to handle
        $formatted_terms = [];
        foreach ($terms as $term) {
            $formatted_terms[] = [
                'id' => $term->term_id,
                'name' => $term->name,
                'slug' => $term->slug,
                'description' => $term->description,
                'count' => $show_count ? $term->count : 0, // Always include count, use 0 if show_count is false
                'parent' => $term->parent,
                'link' => get_term_link($term),
                'level' => 0 // This will be calculated by the JS based on parent
            ];
        }
        
        // Return all terms with no pagination
        $response = [
            'terms' => $formatted_terms,
            'total' => $total,
            'total_pages' => 1,
            'current_page' => 1,
            'per_page' => $total,
            'is_hierarchical' => true
        ];
        
        wp_send_json_success($response);
    }

    /**
     * Build a hierarchical tree of terms
     */
    private function build_term_tree($terms, $parent = 0, $level = 0) {
        // Get settings
        $settings = get_option('BCM_settings', []);
        $show_count = isset($settings['show_count']) ? (bool) $settings['show_count'] : true;
        
        $tree = [];
        foreach ($terms as $term) {
            if ($term->parent == $parent) {
                $term_data = [
                    'id' => $term->term_id,
                    'name' => $term->name,
                    'slug' => $term->slug,
                    'description' => $term->description,
                    'count' => $show_count ? $term->count : null,
                    'parent' => $term->parent,
                    'link' => get_term_link($term),
                    'level' => $level,
                    'children' => $this->build_term_tree($terms, $term->term_id, $level + 1)
                ];
                $tree[] = $term_data;
            }
        }
        return $tree;
    }

    /**
     * Flatten a hierarchical tree for pagination
     */
    private function flatten_term_tree($tree) {
        $flat = [];
        foreach ($tree as $term) {
            $children = isset($term['children']) ? $term['children'] : [];
            unset($term['children']);
            $flat[] = $term;
            if (!empty($children)) {
                $flat = array_merge($flat, $this->flatten_term_tree($children));
            }
        }
        return $flat;
    }

    /**
     * Handle getting term data
     */
    public function handle_get_term_data() {
        // Verify nonce
        $this->verify_nonce();

        // Get term ID and taxonomy from request
        $term_id = isset($_POST['term_id']) ? intval($_POST['term_id']) : 0;
        $taxonomy = isset($_POST['category']) ? sanitize_key($_POST['category']) : 'category';
        
        if (!$term_id) {
            wp_send_json_error(['message' => esc_html__('Invalid term ID.', 'better-category-manager')]);
        }
        
        $term = get_term($term_id, $taxonomy);
        if (!$term || is_wp_error($term)) {
            wp_send_json_error(['message' => esc_html__('Term not found.', 'better-category-manager')]);
        }
        
        // Get term meta
        $term_meta = get_term_meta($term_id);
        
        // Get parent terms for the dropdown
        $parent_terms = $this->get_parent_dropdown_html($taxonomy, $term_id, $term->parent);
        
        // Get taxonomy info
        $taxonomy_obj = get_taxonomy($taxonomy);
        $taxonomy_info = [
            'hierarchical' => $taxonomy_obj->hierarchical,
            'label' => $taxonomy_obj->label
        ];
        
        $response = [
            'term' => [
                'id' => $term->term_id,
                'name' => $term->name,
                'slug' => $term->slug,
                'description' => $term->description,
                'parent' => $term->parent,
                'taxonomy' => $term->taxonomy,
                'meta' => $term_meta
            ],
            'parent_terms' => $parent_terms,
            'category' => $taxonomy_info
        ];
        
        wp_send_json_success($response);
    }

    /**
     * Get parent dropdown HTML
     */
    private function get_parent_dropdown_html($taxonomy, $exclude_id = 0, $selected = 0) {
        // Force taxonomy to be 'category' for Better Category Manager
        $taxonomy = 'category';
        
        // Get all terms
        $terms = get_terms([
            'taxonomy' => $taxonomy,
            'hide_empty' => false,
            'exclude' => $exclude_id
        ]);
        
        if (is_wp_error($terms)) {
            return '';
        }
        
        $dropdown = '<option value="0">' . esc_html__('None', 'better-category-manager') . '</option>';
        
        if (!empty($terms)) {
            $dropdown .= $this->build_term_dropdown_options($terms, 0, 0, $selected);
        }
        
        return $dropdown;
    }
    
    /**
     * Build term dropdown options with proper indentation
     */
    private function build_term_dropdown_options($terms, $parent = 0, $level = 0, $selected = 0) {
        $options = '';
        $indent = str_repeat('&mdash; ', $level);
        
        foreach ($terms as $term) {
            if ($term->parent != $parent) {
                continue;
            }
            
            $is_selected = ($term->term_id == $selected) ? ' selected="selected"' : '';
            $options .= sprintf(
                '<option value="%d"%s>%s%s</option>',
                $term->term_id,
                $is_selected,
                $indent,
                esc_html($term->name)
            );
            
            // Recursively add children
            $options .= $this->build_term_dropdown_options($terms, $term->term_id, $level + 1, $selected);
        }
        
        return $options;
    }

    /**
     * Handle saving term
     */
    public function handle_save_term() {
        // Verify nonce
        $this->verify_nonce();

        // Get data from request
        $term_id = isset($_POST['term_id']) ? intval($_POST['term_id']) : 0;
        $taxonomy = isset($_POST['taxonomy']) ? sanitize_key($_POST['taxonomy']) : 'category';
        $name = isset($_POST['name']) ? sanitize_text_field(wp_unslash($_POST['name'])) : '';
        $slug = isset($_POST['slug']) ? sanitize_title(wp_unslash($_POST['slug'])) : '';
        $description = isset($_POST['description']) ? wp_kses_post(wp_unslash($_POST['description'])) : '';
        $parent = isset($_POST['parent']) ? intval($_POST['parent']) : 0;
        
        if (empty($name)) {
            wp_send_json_error(['message' => __('Name is required.', 'better-category-manager')]);
        }
        
        // Prepare term data
        $term_data = [
            'name' => $name,
            'slug' => $slug,
            'description' => $description,
            'parent' => $parent
        ];
        
        // Update or create term
        if ($term_id) {
            $result = wp_update_term($term_id, $taxonomy, $term_data);
        } else {
            $result = wp_insert_term($name, $taxonomy, $term_data);
        }
        
        if (is_wp_error($result)) {
            wp_send_json_error(['message' => $result->get_error_message()]);
        }
        
        $term = get_term($result['term_id'], $taxonomy);
        
        $response = [
            'id' => $term->term_id,
            'name' => $term->name,
            'slug' => $term->slug,
            'description' => $term->description,
            'parent' => $term->parent,
            'taxonomy' => $term->taxonomy,
            'link' => get_term_link($term)
        ];
        
        wp_send_json_success($response);
    }

    /**
     * Handle deleting term
     */
    public function handle_delete_term() {
        // Verify nonce
        $this->verify_nonce();

        // Get term ID and taxonomy from request
        $term_id = isset($_POST['term_id']) ? intval($_POST['term_id']) : 0;
        $taxonomy = isset($_POST['taxonomy']) ? sanitize_key($_POST['taxonomy']) : 'category';
        
        if (!$term_id) {
            wp_send_json_error(['message' => __('Invalid term ID.', 'better-category-manager')]);
        }
        
        $result = wp_delete_term($term_id, $taxonomy);
        
        if (!$result || is_wp_error($result)) {
            $message = is_wp_error($result) ? $result->get_error_message() : __('Failed to delete term.', 'better-category-manager');
            wp_send_json_error(['message' => $message]);
        }
        
        wp_send_json_success(['message' => __('Term deleted successfully.', 'better-category-manager')]);
    }

    /**
     * Handle updating term hierarchy
     */
    public function handle_update_term_hierarchy() {
        // Verify nonce
        $this->verify_nonce();

        // Get data from request
        $term_id = isset($_POST['term_id']) ? intval($_POST['term_id']) : 0;
        $parent_id = isset($_POST['parent_id']) ? intval($_POST['parent_id']) : 0;
        $taxonomy = isset($_POST['taxonomy']) ? sanitize_key($_POST['taxonomy']) : 'category';
        
        if (!$term_id) {
            wp_send_json_error(['message' => __('Invalid term ID.', 'better-category-manager')]);
        }
        
        $result = wp_update_term($term_id, $taxonomy, ['parent' => $parent_id]);
        
        if (is_wp_error($result)) {
            wp_send_json_error(['message' => $result->get_error_message()]);
        }
        
        wp_send_json_success(['message' => __('Term hierarchy updated.', 'better-category-manager')]);
    }

    /**
     * Handle generating description with OpenAI
     */
    public function handle_generate_description() {
        // Verify nonce
        $this->verify_nonce();

        // Get data from request
        $term_name = isset($_POST['term_name']) ? sanitize_text_field(wp_unslash($_POST['term_name'])) : '';
        $prompt = isset($_POST['prompt']) ? sanitize_textarea_field(wp_unslash($_POST['prompt'])) : '';
        
        if (empty($term_name) || empty($prompt)) {
            wp_send_json_error(['message' => esc_html__('Missing required parameters.', 'better-category-manager')]);
        }
        
        // Replace [TERM_NAME] placeholder with actual term name
        $prompt = str_replace('[TERM_NAME]', $term_name, $prompt);
        
        // Get API key from settings
        $settings = get_option('BCM_settings', []);
        $api_key = isset($settings['openai_api_key']) ? $settings['openai_api_key'] : '';
        
        if (empty($api_key)) {
            wp_send_json_error(['message' => esc_html__('OpenAI API key is not configured.', 'better-category-manager')]);
        }
        
        // Make API request to OpenAI
        $response = $this->generate_with_openai($prompt, $api_key);
        
        if (is_wp_error($response)) {
            wp_send_json_error(['message' => $response->get_error_message()]);
        }
        
        wp_send_json_success(['description' => $response]);
    }
    
    /**
     * Generate description using OpenAI API
     */
    private function generate_with_openai($prompt, $api_key) {
        $url = 'https://api.openai.com/v1/chat/completions';
        
        $headers = [
            'Content-Type' => 'application/json',
            'Authorization' => 'Bearer ' . $api_key
        ];
        
        $body = [
            'model' => 'gpt-3.5-turbo',
            'messages' => [
                [
                    'role' => 'system',
                    'content' => 'You are a helpful assistant that generates concise, informative descriptions for category terms.'
                ],
                [
                    'role' => 'user',
                    'content' => $prompt
                ]
            ],
            'temperature' => 0.7,
            'max_tokens' => 250
        ];
        
        $args = [
            'headers' => $headers,
            'body' => json_encode($body),
            'timeout' => 30,
            'redirection' => 5,
            'httpversion' => '1.1',
            'blocking' => true,
            'data_format' => 'body'
        ];
        
        $response = wp_remote_post($url, $args);
        
        if (is_wp_error($response)) {
            return $response;
        }
        
        $response_code = wp_remote_retrieve_response_code($response);
        if ($response_code !== 200) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            $error_message = isset($body['error']['message']) ? $body['error']['message'] : esc_html__('Unknown error occurred.', 'better-category-manager');
            return new \WP_Error('openai_error', $error_message);
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if (!isset($body['choices'][0]['message']['content'])) {
            return new \WP_Error('openai_error', esc_html__('Invalid response from OpenAI.', 'better-category-manager'));
        }
        
        return $body['choices'][0]['message']['content'];
    }

    /**
     * Handle getting parent terms
     */
    public function handle_get_parent_terms() {
        // Verify nonce
        $this->verify_nonce();

        // Get taxonomy from request - force 'category' for Better Category Manager
        $taxonomy = 'category';
        $exclude = isset($_POST['exclude']) ? intval($_POST['exclude']) : 0;
        
        // Get parent dropdown HTML
        $parent_dropdown = $this->get_parent_dropdown_html($taxonomy, $exclude);
        
        wp_send_json_success(['parent_dropdown' => $parent_dropdown]);
    }
    
    /**
     * Verify nonce for AJAX requests
     */
    private function verify_nonce() {
        if (!check_ajax_referer($this->nonce_key, 'nonce', false)) {
            wp_send_json_error(['message' => __('Security check failed.', 'better-category-manager')]);
        }
    }
    
    /**
     * Get items per page from settings
     */
    private function get_items_per_page() {
        $settings = get_option('BCM_settings', []);
        return isset($settings['items_per_page']) ? intval($settings['items_per_page']) : 50;
    }
}