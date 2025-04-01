<?php
namespace BCATM;

/**
 * Handles import and export functionality for taxonomies
 */
class Import_Export {
    private static $instance = null;

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
        add_action('wp_ajax_BCATM_export_taxonomies', [$this, 'handle_export']);
        add_action('wp_ajax_BCATM_import_taxonomies', [$this, 'handle_import']);
    }

    /**
     * Handle taxonomy export
     */
    public function handle_export() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error(esc_html__('Insufficient permissions', 'better-category-manager'));
        }

        check_ajax_referer('BCATM_nonce', 'nonce');

        // Get the current taxonomy from the request
        $taxonomy = isset($_POST['taxonomy']) ? sanitize_text_field(wp_unslash($_POST['taxonomy'])) : 'category';
        
        // Get the taxonomy object
        $taxonomy_obj = get_taxonomy($taxonomy);
        if (!$taxonomy_obj) {
            wp_send_json_error(esc_html__('Invalid taxonomy', 'better-category-manager'));
        }

        // Get all terms for this taxonomy
        $terms = $this->get_taxonomy_terms($taxonomy);

        $export_data = [
            $taxonomy => [
                'labels' => (array) $taxonomy_obj->labels,
                'description' => $taxonomy_obj->description,
                'public' => $taxonomy_obj->public,
                'hierarchical' => $taxonomy_obj->hierarchical,
                'show_ui' => $taxonomy_obj->show_ui,
                'show_in_menu' => $taxonomy_obj->show_in_menu,
                'show_in_nav_menus' => $taxonomy_obj->show_in_nav_menus,
                'show_tagcloud' => $taxonomy_obj->show_tagcloud,
                'show_in_quick_edit' => $taxonomy_obj->show_in_quick_edit,
                'show_admin_column' => $taxonomy_obj->show_admin_column,
                'terms' => $terms,
            ]
        ];

        wp_send_json_success([
            'data' => $export_data,
            'filename' => sprintf(
                /* translators: %1$s: Taxonomy name, %2$s: Date */
                esc_html__('%1$s export-%2$s.json', 'better-category-manager'), 
                $taxonomy, 
                gmdate('Y-m-d')
            )
        ]);
    }

    private function get_taxonomy_terms($taxonomy) {
        $terms = get_terms([
            'taxonomy' => $taxonomy,
            'hide_empty' => false,
            'orderby' => 'name',
            'order' => 'ASC'
        ]);

        if (is_wp_error($terms)) {
            return [];
        }

        // First, create a map of all terms
        $term_map = [];
        foreach ($terms as $term) {
            $term_map[$term->term_id] = [
                'term_id' => $term->term_id,
                'name' => $term->name,
                'slug' => $term->slug,
                'description' => $term->description,
                'parent' => $term->parent,
                'parent_slug' => null, // Will be filled in next pass
                'meta' => []
            ];
            
            // Get term meta
            $meta = get_term_meta($term->term_id);
            if (!empty($meta)) {
                foreach ($meta as $meta_key => $meta_values) {
                    $term_map[$term->term_id]['meta'][$meta_key] = count($meta_values) === 1 ? $meta_values[0] : $meta_values;
                }
            }
        }

        // Second pass: Add parent slugs
        foreach ($term_map as $term_id => $term_data) {
            if ($term_data['parent'] !== 0) {
                if (isset($term_map[$term_data['parent']])) {
                    $term_map[$term_id]['parent_slug'] = $term_map[$term_data['parent']]['slug'];
                }
            }
        }

        return array_values($term_map);
    }

    /**
     * Handle taxonomy import
     */
    public function handle_import() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error(esc_html__('Insufficient permissions', 'better-category-manager'));
        }

        check_ajax_referer('BCATM_nonce', 'nonce');

        if (!isset($_FILES['import_file']) || !isset($_FILES['import_file']['tmp_name']) || empty($_FILES['import_file']['tmp_name'])) {
            wp_send_json_error(esc_html__('No file uploaded', 'better-category-manager'));
        }

        // Verify the file exists
        if (!is_uploaded_file($_FILES['import_file']['tmp_name'])) {
            wp_send_json_error(esc_html__('Invalid file upload', 'better-category-manager'));
        }
        
        $file_content = file_get_contents($_FILES['import_file']['tmp_name']);
        $import_data = json_decode($file_content, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            wp_send_json_error(esc_html__('Invalid JSON file', 'better-category-manager'));
        }

        $results = [
            'created' => 0,
            'updated' => 0,
            'skipped' => 0,
            'errors' => [],
            'warnings' => []
        ];

        foreach ($import_data as $taxonomy_name => $taxonomy_data) {
            // Skip if taxonomy doesn't exist
            if (!taxonomy_exists($taxonomy_name)) {
                $results['errors'][] = sprintf(
                    /* translators: %1$s: Taxonomy name */
                    esc_html__('Taxonomy "%1$s" does not exist. Skipping.', 'better-category-manager'), 
                    $taxonomy_name
                );
                continue;
            }

            // Import terms
            if (isset($taxonomy_data['terms']) && is_array($taxonomy_data['terms'])) {
                $results = array_merge($results, $this->import_terms($taxonomy_data['terms'], $taxonomy_name));
            }
        }

        wp_send_json_success([
            'message' => sprintf(
                /* translators: %1$d: Created count, %2$d: Updated count, %3$d: Skipped count, %4$d: Errors count, %5$d: Warnings count */
                esc_html__('Import completed. Created: %1$d, Updated: %2$d, Skipped: %3$d, Errors: %4$d, Warnings: %5$d', 'better-category-manager'),
                $results['created'],
                $results['updated'],
                $results['skipped'],
                count($results['errors']),
                count($results['warnings'])
            ),
            'details' => $results
        ]);
    }

    private function detect_circular_dependency($term_slug, $parent_slug, $terms) {
        if (empty($parent_slug)) {
            return false;
        }

        $current_parent = $parent_slug;
        $visited = [$term_slug];

        while ($current_parent) {
            if (in_array($current_parent, $visited)) {
                return true; // Circular dependency detected
            }

            $visited[] = $current_parent;
            
            // Find the parent's parent
            $current_parent = null;
            foreach ($terms as $term) {
                if ($term['slug'] === $current_parent) {
                    $current_parent = $term['parent_slug'];
                    break;
                }
            }
        }

        return false;
    }

    private function sort_terms_hierarchically($terms) {
        // Create a map of terms by their parent_slug
        $term_map = [];
        $root_terms = [];
        
        // First, check for circular dependencies
        foreach ($terms as $term) {
            if ($this->detect_circular_dependency($term['slug'], $term['parent_slug'], $terms)) {
                // If circular dependency found, make it a root term
                $term['parent_slug'] = null;
                $term['parent'] = 0;
            }
        }
        
        // Separate root terms and create a map
        foreach ($terms as $term) {
            if (empty($term['parent_slug'])) {
                $root_terms[] = $term;
            } else {
                if (!isset($term_map[$term['parent_slug']])) {
                    $term_map[$term['parent_slug']] = [];
                }
                $term_map[$term['parent_slug']][] = $term;
            }
        }

        // Helper function to sort terms by name
        $sort_by_name = function($a, $b) {
            return strcmp($a['name'], $b['name']);
        };

        // Sort root terms
        usort($root_terms, $sort_by_name);

        // Function to process terms level by level
        $process_level = function($terms, $level = 0) use (&$process_level, $term_map, $sort_by_name) {
            $result = [];
            foreach ($terms as $term) {
                // Add level information for better import ordering
                $term['_level'] = $level;
                $result[] = $term;
                
                if (isset($term_map[$term['slug']])) {
                    $children = $term_map[$term['slug']];
                    usort($children, $sort_by_name);
                    $result = array_merge($result, $process_level($children, $level + 1));
                }
            }
            return $result;
        };

        // Process all terms starting from root
        return $process_level($root_terms);
    }

    private function analyze_term_structure($terms) {
        $stats = [
            'total_terms' => count($terms),
            'root_terms' => 0,
            'max_depth' => 0,
            'duplicate_names' => [],
            'name_count' => [],
        ];

        // Count term names and find duplicates
        foreach ($terms as $term) {
            if (!isset($stats['name_count'][$term['name']])) {
                $stats['name_count'][$term['name']] = 0;
            }
            $stats['name_count'][$term['name']]++;
            
            if ($stats['name_count'][$term['name']] > 1) {
                if (!isset($stats['duplicate_names'][$term['name']])) {
                    $stats['duplicate_names'][$term['name']] = [];
                }
                $stats['duplicate_names'][$term['name']][] = $term['slug'];
            }

            if (empty($term['parent_slug'])) {
                $stats['root_terms']++;
            }
        }

        // Calculate max depth
        $depth_map = [];
        foreach ($terms as $term) {
            $depth_map[$term['slug']] = $this->calculate_term_depth($term, $terms);
            $stats['max_depth'] = max($stats['max_depth'], $depth_map[$term['slug']]);
        }

        return $stats;
    }

    private function calculate_term_depth($term, $terms, $visited = []) {
        if (empty($term['parent_slug'])) {
            return 0;
        }

        if (in_array($term['slug'], $visited)) {
            return 0; // Prevent infinite recursion
        }

        $visited[] = $term['slug'];
        $parent = null;
        foreach ($terms as $t) {
            if ($t['slug'] === $term['parent_slug']) {
                $parent = $t;
                break;
            }
        }

        if (!$parent) {
            return 0;
        }

        return 1 + $this->calculate_term_depth($parent, $terms, $visited);
    }

    private function validate_term_hierarchy($terms) {
        $valid = true;
        $errors = [];
        $seen_slugs = [];

        foreach ($terms as $term) {
            // Check for required fields
            if (empty($term['name']) || empty($term['slug'])) {
                $errors[] = sprintf(
                    /* translators: %s: Term data */
                    __('Term missing required fields: %s', 'better-category-manager'), 
                    json_encode($term) 
                );
                $valid = false;
                continue;
            }

            // Check for duplicate slugs
            if (in_array($term['slug'], $seen_slugs)) {
                $errors[] = sprintf(
                    /* translators: %s: Term slug */
                    __('Duplicate slug found: %s', 'better-category-manager'), 
                    $term['slug']
                );
                $valid = false;
            }
            $seen_slugs[] = $term['slug'];

            // Validate parent reference
            if (!empty($term['parent_slug'])) {
                $parent_exists = false;
                foreach ($terms as $potential_parent) {
                    if ($potential_parent['slug'] === $term['parent_slug']) {
                        $parent_exists = true;
                        break;
                    }
                }
                if (!$parent_exists) {
                    $errors[] = sprintf(
                        /* translators: %1$s: Parent slug, %2$s: Term name */
                        __('Parent slug not found: %1$s for term: %2$s', 'better-category-manager'), 
                        $term['parent_slug'],
                        $term['name']
                    );
                    $valid = false;
                }
            }
        }

        return [
            'valid' => $valid,
            'errors' => $errors
        ];
    }

    private function import_terms($terms, $taxonomy) {
        $results = [
            'created' => 0,
            'updated' => 0,
            'skipped' => 0,
            'errors' => [],
            'warnings' => []
        ];

        // Analyze and validate term structure
        $structure = $this->analyze_term_structure($terms);
        $validation = $this->validate_term_hierarchy($terms);

        if (!$validation['valid']) {
            $results['errors'] = array_merge($results['errors'], $validation['errors']);
            return $results;
        }

        // Add warnings for duplicate names
        foreach ($structure['duplicate_names'] as $name => $slugs) {
            
            $results['warnings'][] = sprintf(
                /* translators: %1$s: Term name, %2$s: List of slugs */
                __('Multiple terms found with name "%1$s" using slugs: %2$s', 'better-category-manager'),
                $name,
                implode(', ', $slugs)
            );
        }

        // Sort terms hierarchically
        $sorted_terms = $this->sort_terms_hierarchically($terms);

        // First pass: Create all terms without setting parents
        $slug_to_id_map = [];
        $existing_slugs = [];

        foreach ($sorted_terms as $term_data) {
            $import_data = [
                'name' => $term_data['name'],
                'slug' => $term_data['slug'],
                'description' => $term_data['description'],
            ];

            // Handle duplicate slugs by appending parent info
            if (in_array($term_data['slug'], $existing_slugs)) {
                $parent_suffix = !empty($term_data['parent_slug']) ? '-' . $term_data['parent_slug'] : '';
                $import_data['slug'] = $term_data['slug'] . $parent_suffix;
                
                if (in_array($import_data['slug'], $existing_slugs)) {
                    $counter = 1;
                    while (in_array($import_data['slug'] . '-' . $counter, $existing_slugs)) {
                        $counter++;
                    }
                    $import_data['slug'] = $import_data['slug'] . '-' . $counter;
                }
                
                $results['warnings'][] = sprintf(
                    /* translators: %1$s: Original slug, %2$s: Modified slug */
                    __('Modified duplicate slug "%1$s" to "%2$s"', 'better-category-manager'),
                    $term_data['slug'],
                    $import_data['slug']
                );
            }
            $existing_slugs[] = $import_data['slug'];

            $result = $this->create_or_update_term($import_data, $taxonomy);
            
            if ($result['status'] === 'created' || $result['status'] === 'updated') {
                $slug_to_id_map[$term_data['slug']] = $result['term_id'];
                
                // Import term meta
                if (!empty($term_data['meta'])) {
                    foreach ($term_data['meta'] as $meta_key => $meta_value) {
                        update_term_meta($result['term_id'], $meta_key, $meta_value);
                    }
                }
                
                $results[$result['status']]++;
            } else {
                $results['skipped']++;
                if (!empty($result['error'])) {
                    $results['errors'][] = $result['error'];
                }
            }
        }

        // Second pass: Update parent relationships
        foreach ($sorted_terms as $term_data) {
            if (!empty($term_data['parent_slug'])) {
                $current_term_id = $slug_to_id_map[$term_data['slug']] ?? null;
                $parent_term_id = $slug_to_id_map[$term_data['parent_slug']] ?? null;
                
                if ($current_term_id && $parent_term_id) {
                    wp_update_term($current_term_id, $taxonomy, [
                        'parent' => $parent_term_id
                    ]);
                } else {
                    $results['warnings'][] = sprintf(
                        /* translators: %1$s: Parent slug, %2$s: Term name */
                        __('Could not set parent "%1$s" for term "%2$s"', 'better-category-manager'),
                        $term_data['parent_slug'],
                        $term_data['name']
                    );
                }
            }
        }

        // Add structure information to results
        $results['structure'] = $structure;

        return $results;
    }

    /**
     * Create or update a term
     */
    private function create_or_update_term($term_data, $taxonomy) {
        $result = [
            'term_id' => 0,
            'status' => 'skipped',
            'error' => '',
        ];

        // Check if term exists by slug
        $existing_term = get_term_by('slug', $term_data['slug'], $taxonomy);
        
        // Also check by name if not found by slug
        if (!$existing_term) {
            $existing_term = get_term_by('name', $term_data['name'], $taxonomy);
        }

        if ($existing_term) {
            // Update existing term
            $update_args = [
                'name' => $term_data['name'],
                'slug' => $term_data['slug'],
                'description' => $term_data['description'],
            ];
            
            $updated_term = wp_update_term($existing_term->term_id, $taxonomy, $update_args);
            
            if (is_wp_error($updated_term)) {
                $result['status'] = 'error';
                $result['error'] = $updated_term->get_error_message();
            } else {
                $result['status'] = 'updated';
                $result['term_id'] = $updated_term['term_id'];
                
                // Update term meta
                if (isset($term_data['meta']) && is_array($term_data['meta'])) {
                    foreach ($term_data['meta'] as $meta_key => $meta_value) {
                        update_term_meta($updated_term['term_id'], $meta_key, $meta_value);
                    }
                }
            }
        } else {
            // Create new term
            $insert_args = [
                'slug' => $term_data['slug'],
                'description' => isset($term_data['description']) ? $term_data['description'] : '',
            ];
 
            $new_term = wp_insert_term($term_data['name'], $taxonomy, $insert_args);
            
            if (is_wp_error($new_term)) {
                $result['status'] = 'error';
                $result['error'] = $new_term->get_error_message();
            } else {
                $result['status'] = 'created';
                $result['term_id'] = $new_term['term_id'];
                
                // Add term meta
                if (isset($term_data['meta']) && is_array($term_data['meta'])) {
                    foreach ($term_data['meta'] as $meta_key => $meta_value) {
                        add_term_meta($new_term['term_id'], $meta_key, $meta_value);
                    }
                }
            }
        }

        return $result;
    }
}
