<?php
/**
 * Term edit modal template for BCM Category Manager
 *
 * @package BCM
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}
?>

<script type="text/template" id="tmpl-BCM-term-row">
    <div class="BCM-term-row" data-id="{{ data.id }}" data-parent="{{ data.parent }}">
        <div class="BCM-term-content">
            <!-- Drag Handle -->
            <div class="BCM-term-handle" title="<?php esc_attr_e('Drag to reorder','better-category-manager'); ?>">
                <span class="dashicons dashicons-menu"></span>
            </div>

            <!-- Expand/Collapse Button -->
            <# if (data.hasChildren) { #>
            <button type="button" class="BCM-toggle-children"
                    title="<?php esc_attr_e('Toggle children visibility','better-category-manager'); ?>">
                <span class="dashicons dashicons-arrow-right"></span>
            </button>
            <# } else { #>
            <div class="BCM-toggle-placeholder" style="width: 24px;"></div>
            <# } #>

            <!-- Term Information -->
            <div class="BCM-term-info">
                <span class="BCM-term-name">{{ data.name }}</span>
                <span class="BCM-term-count"
                      title="<?php esc_attr_e('Number of posts using this term','better-category-manager'); ?>">
                    {{ data.count || '0' }}
                </span>
            </div>

            <!-- Term Actions -->
            <div class="BCM-term-actions">
                <button type="button" class="button BCM-edit-term"
                        title="<?php esc_attr_e('Edit this term','better-category-manager'); ?>">
                    <span class="screen-reader-text"><?php esc_html_e('Edit','better-category-manager'); ?></span>
                    <span class="dashicons dashicons-edit"></span>
                </button>
                <# if (data.canDelete) { #>
                <button type="button" class="button BCM-quick-delete"
                        title="<?php esc_attr_e('Delete this term','better-category-manager'); ?>">
                    <span class="screen-reader-text"><?php esc_html_e('Delete','better-category-manager'); ?></span>
                    <span class="dashicons dashicons-trash"></span>
                </button>
                <# } #>
            </div>
        </div>
    </div>
</script>

<script type="text/template" id="tmpl-BCM-term-form">
    <form id="BCM-term-edit-form" class="BCM-term-form">
        <?php wp_nonce_field('BCM_edit_term', 'BCM_term_nonce'); ?>
        <input type="hidden" id="term-id" name="term_id" value="{{ data.id }}">
        <input type="hidden" id="category-name" name="category" value="{{ data.category }}">

        <!-- Name Field -->
        <div class="BCM-form-field">
            <label for="term-name">
                <?php esc_html_e('Name','better-category-manager'); ?>
                <span class="required">*</span>
            </label>
            <input type="text"
                   id="term-name"
                   name="name"
                   value="{{ data.name }}"
                   required
                   maxlength="200"
                   autocomplete="off">
            <p class="description">
                <?php esc_html_e('The name is how it appears on your site.','better-category-manager'); ?>
            </p>
        </div>

        <!-- Slug Field -->
        <div class="BCM-form-field">
            <label for="term-slug"><?php esc_html_e('Slug','better-category-manager'); ?></label>
            <input type="text"
                   id="term-slug"
                   name="slug"
                   value="{{ data.slug }}"
                   maxlength="200"
                   autocomplete="off">
            <p class="description">
                <?php esc_html_e('The "slug" is the URL-friendly version of the name. It is usually all lowercase and contains only letters, numbers, and hyphens.','better-category-manager'); ?>
            </p>
        </div>

        <!-- Parent Field -->
        <# if (data.showParent) { #>
        <div class="BCM-form-field">
            <label for="term-parent"><?php esc_html_e('Parent','better-category-manager'); ?></label>
            <select id="term-parent" name="parent">
                {{{ data.parentDropdown }}}
            </select>
            <p class="description">
                <?php esc_html_e('Assign a parent term to create a hierarchy. The term will be a sub-item of the parent.','better-category-manager'); ?>
            </p>
        </div>
        <# } #>

        <!-- Description Field -->
        <div class="BCM-form-field">
            <label for="term-description"><?php esc_html_e('Description','better-category-manager'); ?></label>
            <textarea id="term-description"
                      name="description"
                      rows="5"
                      maxlength="2000">{{ data.description }}</textarea>
            <p class="description">
                <?php esc_html_e('The description is not prominent by default; however, some themes may show it.','better-category-manager'); ?>
            </p>
        </div>

        <!-- OpenAI Description Generator -->
        <?php if (BCM\Settings::get_instance()->get_openai_api_key()): ?>
            <div class="BCM-form-field openai-controls">
                <h3><?php esc_html_e('OpenAI Description Generator','better-category-manager'); ?></h3>
                <label for="openai-prompt"><?php esc_html_e('Prompt','better-category-manager'); ?></label>
                <textarea id="openai-prompt"
                          name="openai_prompt"
                          rows="3"
                          maxlength="500"
                          placeholder="<?php esc_attr_e('Enter a prompt to generate a description...','better-category-manager'); ?>">{{{ data.default_prompt }}}</textarea>

                <button type="button" id="generate-description" class="button">
                    <span class="spinner"></span>
                    <span class="dashicons dashicons-editor-spellcheck"></span>
                    <?php esc_html_e('Generate Description','better-category-manager'); ?>
                </button>

                <p class="description">
                    <?php esc_html_e('Use OpenAI to generate a description based on the term name and your prompt.','better-category-manager'); ?>
                </p>
            </div>
        <?php endif; ?>

        <!-- Form Actions -->
        <div class="BCM-form-actions">
            <# if (data.id && data.canDelete) { #>
            <button type="button" class="button button-link-delete BCM-delete-term">
                <span class="dashicons dashicons-trash"></span>
                <?php esc_html_e('Delete','better-category-manager'); ?>
            </button>
            <# } #>

            <button type="button" class="button BCM-cancel-edit">
                <?php esc_html_e('Cancel','better-category-manager'); ?>
            </button>
            <button type="submit" class="button button-primary BCM-save-term">
                <span class="dashicons dashicons-saved"></span>
                <?php esc_html_e('Save Changes','better-category-manager'); ?>
            </button>
        </div>
    </form>
</script>

<?php
// Include helper template for empty state
?>
<script type="text/template" id="tmpl-BCM-no-terms">
    <div class="BCM-no-terms">
        <p><?php esc_html_e('No terms found.','better-category-manager'); ?></p>
        <button type="button" class="button button-primary BCM-add-first-term">
            <span class="dashicons dashicons-plus-alt2"></span>
            <?php esc_html_e('Add Your First Term','better-category-manager'); ?>
        </button>
    </div>
</script>