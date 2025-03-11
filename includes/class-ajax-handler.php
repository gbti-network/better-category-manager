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

        // Get taxonomy from request
        $taxonomy = isset($_POST['taxonomy']) ? sanitize_key($_POST['taxonomy']) : 'category';
        $search = isset($_POST['search']) ? sanitize_text_field(wp_unslash($_POST['search'])) : '';
        $page = isset($_POST['page']) ? intval($_POST['page']) : 1;
        $per_page = $this->get_items_per_page();
        $offset = ($page - 1) * $per_page;
        
        // Get settings
        $settings = get_option('BCM_settings', []);
        $show_count = isset($settings['show_count']) ? (bool) $settings['show_count'] : true;

        // Query args
        $args = [
            'taxonomy' => $taxonomy,
            'hide_empty' => false,
            'search' => $search,
            'number' => $per_page > 0 ? $per_page : 0,
            'offset' => $per_page > 0 ? $offset : 0,
            'orderby' => 'name',
            'order' => 'ASC',
            'fields' => 'all'
        ];

        // Get taxonomy object
        $taxonomy_obj = get_taxonomy($taxonomy);
        if (!$taxonomy_obj) {
            wp_send_json_error(['message' => __('Invalid taxonomy.', 'better-category-manager')]);
        }

        // Get hierarchical setting from taxonomy
        $is_hierarchical = $taxonomy_obj->hierarchical;
        
        if ($is_hierarchical) {
            // For hierarchical taxonomies, we need to get all terms and build a tree
            unset($args['number']);
            unset($args['offset']);
            $terms = get_terms($args);
            
            if (is_wp_error($terms)) {
                wp_send_json_error(['message' => $terms->get_error_message()]);
            }
            
            // Count total before building hierarchy
            $total = count($terms);
            
            // Build term tree
            $terms_tree = $this->build_term_tree($terms);
            
            // Paginate the flattened tree
            if ($per_page > 0) {
                $flattened_tree = $this->flatten_term_tree($terms_tree);
                $total_pages = ceil(count($flattened_tree) / $per_page);
                $paginated_tree = array_slice($flattened_tree, $offset, $per_page);
                
                $response = [
                    'terms' => $paginated_tree,
                    'total' => count($flattened_tree),
                    'total_pages' => $total_pages,
                    'current_page' => $page,
                    'per_page' => $per_page,
                    'is_hierarchical' => true
                ];
            } else {
                // Return the full tree
                $response = [
                    'terms' => $terms_tree,
                    'total' => $total,
                    'total_pages' => 1,
                    'current_page' => 1,
                    'per_page' => $total,
                    'is_hierarchical' => true
                ];
            }
        } else {
            // For non-hierarchical taxonomies, get paginated terms
            $terms = get_terms($args);
            
            if (is_wp_error($terms)) {
                wp_send_json_error(['message' => $terms->get_error_message()]);
            }
            
            // Get total without pagination
            $count_args = [
                'taxonomy' => $taxonomy,
                'hide_empty' => false,
                'search' => $search,
                'fields' => 'count'
            ];
            $total = get_terms($count_args);
            $total_pages = $per_page > 0 ? ceil($total / $per_page) : 1;
            
            // Format terms for response
            $formatted_terms = [];
            foreach ($terms as $term) {
                $formatted_terms[] = [
                    'id' => $term->term_id,
                    'name' => $term->name,
                    'slug' => $term->slug,
                    'description' => $term->description,
                    'count' => $show_count ? $term->count : null,
                    'parent' => $term->parent,
                    'link' => get_term_link($term),
                    'level' => 0 // Non-hierarchical terms are all at level 0
                ];
            }
            
            $response = [
                'terms' => $formatted_terms,
                'total' => $total,
                'total_pages' => $total_pages,
                'current_page' => $page,
                'per_page' => $per_page,
                'is_hierarchical' => false
            ];
        }
        
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
        $taxonomy = isset($_POST['taxonomy']) ? sanitize_key($_POST['taxonomy']) : 'category';
        
        if (!$term_id) {
            wp_send_json_error(['message' => __('Invalid term ID.', 'better-category-manager')]);
        }
        
        $term = get_term($term_id, $taxonomy);
        if (!$term || is_wp_error($term)) {
            wp_send_json_error(['message' => __('Term not found.', 'better-category-manager')]);
        }
        
        // Get term meta
        $term_meta = get_term_meta($term_id);
        
        $response = [
            'id' => $term->term_id,
            'name' => $term->name,
            'slug' => $term->slug,
            'description' => $term->description,
            'parent' => $term->parent,
            'taxonomy' => $term->taxonomy,
            'meta' => $term_meta
        ];
        
        wp_send_json_success($response);
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
     * Handle getting parent terms
     */
    public function handle_get_parent_terms() {
        // Verify nonce
        $this->verify_nonce();

        // Get taxonomy from request
        $taxonomy = isset($_POST['taxonomy']) ? sanitize_key($_POST['taxonomy']) : 'category';
        $exclude = isset($_POST['exclude']) ? intval($_POST['exclude']) : 0;
        
        // Get taxonomy object
        $taxonomy_obj = get_taxonomy($taxonomy);
        if (!$taxonomy_obj || !$taxonomy_obj->hierarchical) {
            wp_send_json_error(['message' => __('This taxonomy does not support parent-child relationships.', 'better-category-manager')]);
        }
        
        // Get terms
        $terms = get_terms([
            'taxonomy' => $taxonomy,
            'hide_empty' => false,
            'exclude' => $exclude > 0 ? [$exclude] : [],
            'fields' => 'id=>name'
        ]);
        
        if (is_wp_error($terms)) {
            wp_send_json_error(['message' => $terms->get_error_message()]);
        }
        
        // Format terms for dropdown
        $options = [];
        $options[0] = __('None', 'better-category-manager');
        
        foreach ($terms as $id => $name) {
            $options[$id] = $name;
        }
        
        wp_send_json_success(['options' => $options]);
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