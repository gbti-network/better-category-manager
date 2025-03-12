/**
 * BCM Category Editor JavaScript
 */
(function($) {
    'use strict';

    /**
     * BCM Category Editor Class
     */
    class CategoryEditor {
        /**
         * Constructor
         */
        constructor() {
            // Set up safe storage handling
            this.setupSafeStorage();
            
            // Initialize templates first to catch errors early
            try {
                this.templates = {
                    termRow: wp.template('BCM-term-row'),
                    termForm: wp.template('BCM-term-form')
                };
            } catch (error) {
                console.error('Error initializing templates:', error);
                this.templates = {
                    termRow: null,
                    termForm: null
                };
            }
            
            this.initializeElements();
            this.initializeState();
        }

        /**
         * Set up safe storage handling to prevent errors
         */
        setupSafeStorage() {
            this.storage = {
                get: (key, defaultValue = null) => {
                    try {
                        if (window.localStorage) {
                            const item = window.localStorage.getItem(key);
                            if (item !== null) {
                                return JSON.parse(item);
                            }
                        }
                    } catch (e) {
                        console.warn('Storage access error', e);
                        // Continue execution even if localStorage fails
                    }
                    return defaultValue;
                },
                set: (key, value) => {
                    try {
                        if (window.localStorage) {
                            window.localStorage.setItem(key, JSON.stringify(value));
                            return true;
                        }
                    } catch (e) {
                        console.warn('Storage access error', e);
                        // Fail silently, application can continue without storage
                    }
                    return false;
                },
                remove: (key) => {
                    try {
                        if (window.localStorage) {
                            window.localStorage.removeItem(key);
                            return true;
                        }
                    } catch (e) {
                        console.warn('Storage access error', e);
                    }
                    return false;
                }
            };
        }

        /**
         * Initialize DOM element references
         */
        initializeElements() {
            this.elements = {
                categorySelect: $('#category-select'),
                termSearch: $('#term-search'),
                addNewBtn: $('#add-new-term'),
                termsTree: $('#category-terms-tree'),
                termEditor: $('.BCM-term-editor'),
                closeEditorBtn: $('.BCM-close-editor'),
                editorContent: $('.BCM-term-editor-content'),
                container: $('.BCM-terms-tree'),
                notificationContainer: $('#BCM-notification-container'),
                loadingOverlay: $('.BCM-loading-overlay'),
                collapseAllBtn: $('.BCM-collapse-all'),
                expandAllBtn: $('.BCM-expand-all')
            };
            
            // Create loading overlay if it doesn't exist
            if (!this.elements.loadingOverlay || !this.elements.loadingOverlay.length) {
                console.warn('Loading overlay not found, creating one');
                this.elements.container.append('<div class="BCM-loading-overlay"><span class="spinner is-active"></span></div>');
                this.elements.loadingOverlay = $('.BCM-loading-overlay');
            }
        }

        /**
         * Initialize state
         */
        initializeState() {
            this.state = {
                currentCategory: this.elements.categorySelect.val(),
                currentTermId: null,
                expandedTerms: new Set(),
                isDragging: false,
                hasUnsavedChanges: false,
                contentLoaded: false, // Track if content has been loaded
                initialLoadComplete: false, // Track if initial load is complete
                isHierarchical: true, // Track if the current category is hierarchical
                isLoading: false
            };
        }

        /**
         * Initialize the editor
         */
        init() {
            // Validate dependencies
            if (typeof BCMAdmin === 'undefined') {
                console.error('BCMAdmin is not defined. Cannot initialize editor.');
                this.showError('Error initializing editor. Please refresh the page and try again.');
                return;
            }
            
            if (!this.templates.termRow || !this.templates.termForm) {
                console.error('Required templates are missing');
                this.showError('Required templates are missing. Please refresh the page and try again.');
                return;
            }
            
            this.bindEvents();
            this.loadTerms();
        }

        /**
         * Bind event listeners
         */
        bindEvents() {
            try {
                // Category selection
                this.elements.categorySelect.on('change', () => {
                    this.state.currentCategory = this.elements.categorySelect.val();
                    this.loadTerms();
                });

                // Term search
                this.elements.termSearch.on('input', this.debounce(() => {
                    this.filterTerms(this.elements.termSearch.val());
                }, 300));

                // Add new term
                this.elements.addNewBtn.on('click', () => this.showTermForm());

                // Term tree events
                this.elements.termsTree.on('click', '.BCM-toggle-children', (e) => {
                    e.stopPropagation();
                    const termRow = $(e.target).closest('.BCM-term-row');
                    this.toggleChildren(termRow);
                });

                this.elements.termsTree.on('click', '.BCM-edit-term', (e) => {
                    e.stopPropagation();
                    const termId = $(e.target).closest('.BCM-term-row').data('id');
                    this.loadTermData(termId);
                });

                // Close editor
                this.elements.closeEditorBtn.on('click', () => {
                    if (this.state.hasUnsavedChanges) {
                        if (confirm(BCMAdmin.i18n.unsaved_changes || 'There are unsaved changes. Do you want to discard them?')) {
                            this.state.hasUnsavedChanges = false;
                            this.hideTermEditor();
                        }
                    } else {
                        this.hideTermEditor();
                    }
                });

                // Editor form events
                $(document).on('submit', '#BCM-term-edit-form', (e) => {
                    e.preventDefault();
                    this.saveTerm();
                });

                $(document).on('click', '.BCM-delete-term', (e) => {
                    e.preventDefault();
                    if (confirm(BCMAdmin.i18n.confirm_delete)) {
                        this.deleteTerm();
                    }
                });

                // OpenAI description generation
                $(document).on('click', '#generate-description', (e) => {
                    e.preventDefault();
                    this.generateDescription();
                });

                // Track changes
                $(document).on('change input', '#BCM-term-edit-form input, #BCM-term-edit-form textarea, #BCM-term-edit-form select', () => {
                    this.state.hasUnsavedChanges = true;
                });

                // Expand/Collapse All buttons
                this.elements.collapseAllBtn.on('click', () => {
                    this.collapseAllFirstLevel();
                });

                this.elements.expandAllBtn.on('click', () => {
                    this.expandAllFirstLevel();
                });
            } catch (error) {
                console.error('Error binding events:', error);
            }
        }

        /**
         * Load terms for the selected category
         */
        loadTerms(suppressNotification = false) {
            const category = this.state.currentCategory;
            if (!category) {
                console.log('No category selected');
                return;
            }
            
            // Show loading overlay
            this.setLoading(true);
            
            BCM.debug.group('Loading terms for category: ' + category);
            
            $.ajax({
                url: BCMAdmin.ajax_url,
                type: 'POST',
                dataType: 'json',
                data: {
                    action: 'BCM_get_terms',
                    nonce: BCMAdmin.nonce,
                    category: category
                },
                success: (response) => {
                    if (response.success) {
                        BCM.debug.log('Terms loaded successfully', response.data);
                        
                        // Update is_hierarchical state
                        this.state.isHierarchical = response.data.is_hierarchical;
                        
                        // Show/hide tree controls based on hierarchical status
                        if (this.state.isHierarchical) {
                            $('.BCM-tree-controls').show();
                        } else {
                            $('.BCM-tree-controls').hide();
                        }
                        
                        // Render terms
                        this.renderTerms(response.data.terms);
                        this.state.contentLoaded = true;
                        this.state.initialLoadComplete = true;
                    } else {
                        console.error('Error loading terms', response.data);
                        if (!suppressNotification) {
                            this.showError(response.data.message || 'Error loading terms');
                        }
                    }
                },
                error: () => {
                    console.error('Failed to load terms');
                    if (!suppressNotification) {
                        this.showError('Failed to load terms. Please try again.');
                    }
                },
                complete: () => {
                    // Hide loading overlay
                    this.setLoading(false);
                    BCM.debug.groupEnd();
                }
            });
        }

        /**
         * Render terms in the tree view
         */
        renderTerms(terms) {
            BCM.debug.group('Rendering terms');
            
            // Get the category info from the first term if available
            if (terms && terms.length > 0 && terms[0].category_info) {
                this.state.isHierarchical = terms[0].category_info.hierarchical;
                BCM.debug.log('Category hierarchical status:', this.state.isHierarchical);
                
                // Add a class to the container to indicate hierarchy status
                if (this.state.isHierarchical) {
                    this.elements.container.addClass('BCM-hierarchical-category');
                    this.elements.container.removeClass('BCM-flat-category');
                    $('.BCM-tree-controls').show(); // Show expand/collapse controls for hierarchical taxonomies
                } else {
                    this.elements.container.addClass('BCM-flat-category');
                    this.elements.container.removeClass('BCM-hierarchical-category');
                    $('.BCM-tree-controls').hide(); // Hide expand/collapse controls for non-hierarchical taxonomies
                }
            }
            
            this.elements.termsTree.empty();

            if (!terms || !terms.length) {
                this.elements.termsTree.html(
                    `<p class="BCM-no-terms">${BCMAdmin.i18n.no_terms}</p>`
                );
                return;
            }

            const createTermTree = (terms, parent = 0) => {
                const children = terms.filter(term => term.parent === parent);
                if (!children.length) return '';

                const ul = $('<ul class="BCM-term-list"></ul>');
                children.forEach(term => {
                    const hasChildren = terms.some(t => t.parent === term.id);
                    const termHtml = this.templates.termRow({
                        id: term.id,
                        name: term.name,
                        count: term.count || 0,
                        hasChildren: hasChildren,
                        parent: term.parent
                    });

                    const li = $('<li></li>').html(termHtml);
                    if (hasChildren) {
                        const childrenContainer = createTermTree(terms, term.id);
                        if (this.state.expandedTerms.has(term.id)) {
                            childrenContainer.show();
                            li.find('.BCM-toggle-children .dashicons')
                                .addClass('dashicons-arrow-down')
                                .removeClass('dashicons-arrow-right');
                        }
                        li.append(childrenContainer);
                    }
                    ul.append(li);
                });

                return ul;
            };

            this.elements.termsTree.append(createTermTree(terms));
            
            // Only initialize drag and drop if category is hierarchical
            if (this.state.isHierarchical) {
                this.initDragAndDrop();
            } else {
                BCM.debug.log('Skipping drag and drop for non-hierarchical category');
                // Disable drag handles for non-hierarchical taxonomies
                this.elements.termsTree.find('.BCM-term-handle').addClass('BCM-disabled').attr('title', 'Drag and drop not available for non-hierarchical taxonomies');
            }
            
            BCM.debug.groupEnd();
        }

        /**
         * Initialize drag and drop functionality
         */
        initDragAndDrop() {
            try {
                if (!this.elements.termsTree || !this.elements.termsTree.length) {
                    console.warn('Terms tree element not found, cannot initialize drag and drop');
                    return;
                }
                
                const self = this;
                
                this.elements.termsTree.sortable({
                    items: '> li',
                    placeholder: 'BCM-sortable-placeholder',
                    handle: '.BCM-term-handle',
                    update: function(event, ui) {
                        self.updateTermOrder();
                    }
                });
                
                // Log success message
                console.log('Drag and drop initialized successfully');
            } catch (error) {
                console.error('Failed to initialize drag and drop:', error);
            }
        }

        /**
         * Update term hierarchy
         */
        updateTermHierarchy($item, newParentId) {
            // Skip the AJAX call if we're dealing with a non-hierarchical category
            if (!this.state.isHierarchical) {
                this.loadTerms(); // Just reload terms to restore original structure
                return;
            }

            console.group('Updating term hierarchy');
            console.log('Term ID:', $item.find('.BCM-term-row').data('id'));
            console.log('New parent ID:', newParentId);
            
            this.setLoading(true);

            $.ajax({
                url: BCMAdmin.ajax_url,
                method: 'POST',
                data: {
                    action: 'BCM_update_term_hierarchy',
                    term_id: $item.find('.BCM-term-row').data('id'),
                    parent_id: newParentId,
                    category: this.state.currentCategory,
                    nonce: BCMAdmin.nonce
                },
                success: (response) => {
                    console.log('Ajax response:', response);
                    if (!response.success) {
                        console.error('Hierarchy update failed:', response.data.message);
                        this.showError(response.data.message);
                        this.loadTerms();
                    } else {
                        console.log('Hierarchy updated successfully');
                        // Only show success notification for hierarchy update here
                        if (response.data && response.data.message) {
                            this.forceDisplayNotification(response.data.message, 'success');
                        } else {
                            // Use default message if none provided in response
                            this.forceDisplayNotification(
                                BCMAdmin.i18n.term_updated || 'Term updated successfully.', 
                                'success'
                            );
                        }
                        
                        // Load terms without notification
                        this.loadTerms(true);
                    }
                },
                error: (xhr, status, error) => {
                    console.error('Ajax error:', {xhr, status, error});
                    this.showError(BCMAdmin.i18n.hierarchy_update_error);
                    this.loadTerms();
                },
                complete: () => {
                    this.setLoading(false);
                    console.groupEnd();
                }
            });
        }

        /**
         * Refresh sortable initialization after structure changes
         */
        refreshSortable() {
            $('.BCM-terms-tree .BCM-term-list').each((_, list) => {
                const $list = $(list);
                if ($list.data('sortable')) {
                    $list.sortable('refresh');
                }
            });
        }

        /**
         * Toggle term children visibility
         */
        toggleChildren(termRow) {
            const termId = termRow.data('id');
            const childrenContainer = termRow.next('.BCM-term-list');
            const toggleBtn = termRow.find('.BCM-toggle-children .dashicons');

            if (childrenContainer.is(':visible')) {
                childrenContainer.slideUp(200);
                toggleBtn.removeClass('dashicons-arrow-down').addClass('dashicons-arrow-right');
                this.state.expandedTerms.delete(termId);
            } else {
                childrenContainer.slideDown(200);
                toggleBtn.removeClass('dashicons-arrow-right').addClass('dashicons-arrow-down');
                this.state.expandedTerms.add(termId);
            }
        }

        /**
         * Filter terms based on search input
         */
        filterTerms(search) {
            const searchLower = search.toLowerCase();
            const terms = this.elements.termsTree.find('.BCM-term-row');

            terms.each((_, term) => {
                const $term = $(term);
                const termName = $term.find('.BCM-term-name').text().toLowerCase();
                const isMatch = termName.includes(searchLower);

                if (isMatch) {
                    $term.show();
                    // Show parents
                    $term.parents('.BCM-term-list').show();
                    $term.parents('.BCM-term-row').show();
                } else {
                    // Only hide if no children match
                    const hasMatchingChild = $term.next('.BCM-term-list')
                        .find('.BCM-term-name')
                        .text()
                        .toLowerCase()
                        .includes(searchLower);

                    if (!hasMatchingChild) {
                        $term.hide();
                    }
                }
            });
        }

        /**
         * Load term data for editing
         */
        loadTermData(termId) {
            if (this.state.hasUnsavedChanges &&
                !confirm(BCMAdmin.i18n.unsaved_changes || 'There are unsaved changes. Do you want to discard them?')) {
                return;
            }

            this.setLoading(true);
            this.state.currentTermId = termId;

            $.ajax({
                url: BCMAdmin.ajax_url,
                method: 'POST',
                data: {
                    action: 'BCM_get_term_data',
                    term_id: termId,
                    category: this.state.currentCategory,
                    nonce: BCMAdmin.nonce
                },
                success: (response) => {
                    if (response.success && response.data) {
                        // Log the response to verify data
                        console.log('Term data received:', response.data);
                        
                        // Check if we have a direct term data object
                        const termData = response.data.term || response.data;
                        
                        // Safely check for required properties
                        if (!termData || typeof termData !== 'object') {
                            console.error('Term data is missing or invalid in the response', response);
                            this.showError('Invalid term data received. Please try again.');
                            return;
                        }
                        
                        // Get category info - may be in different locations depending on response structure
                        const categoryInfo = response.data.category || {};
                        const showParent = categoryInfo.hierarchical !== undefined ? 
                            !!categoryInfo.hierarchical : this.state.isHierarchical;
                        
                        // Get the default prompt - prioritize the dedicated default_ai_prompt property
                        const defaultPrompt = window.BCMAdmin && window.BCMAdmin.default_ai_prompt ? 
                            window.BCMAdmin.default_ai_prompt : '';
                        
                        // Format the data for the form template
                        const formData = {
                            id: termData.id || 0,
                            name: termData.name || '',
                            slug: termData.slug || '',
                            description: termData.description || '',
                            category: termData.category || termData.taxonomy || this.state.currentCategory,
                            parent: termData.parent || 0,
                            showParent: showParent,
                            parentDropdown: response.data.parent_terms || '',
                            canDelete: true,
                            default_prompt: defaultPrompt
                        };

                        this.showTermForm(formData);
                    } else {
                        const errorMsg = response.data && response.data.message ? 
                            response.data.message : 
                            'Failed to load term data. Please try again.';
                        this.showError(errorMsg);
                    }
                },
                error: (xhr, status, error) => {
                    console.error('Ajax error:', {xhr, status, error});
                    this.showError(BCMAdmin.i18n.error_loading || 'Failed to load term data');
                },
                complete: () => {
                    this.setLoading(false);
                }
            });
        }

        /**
         * Save term
         */
        saveTerm() {
            console.log('Saving term...');
            const formData = new FormData($('#BCM-term-edit-form')[0]);
            formData.append('action', 'BCM_save_term');
            formData.append('nonce', BCMAdmin.nonce);

            this.setLoading(true);

            $.ajax({
                url: BCMAdmin.ajax_url,
                method: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: (response) => {
                    console.log('Save term response:', response);
                    if (response.success) {
                        // Set form as not dirty to prevent "unsaved changes" warning
                        this.state.hasUnsavedChanges = false;
                        this.hideTermEditor();
                        
                        // Force a notification with success message
                        if (response.data && typeof response.data.message !== 'undefined') {
                            // Force direct notification display
                            const message = response.data.message;
                            this.forceDisplayNotification(message, 'success');
                        } else {
                            // Use default message if none provided in response
                            this.forceDisplayNotification(
                                BCMAdmin.i18n.term_updated || 'Term updated successfully.', 
                                'success'
                            );
                        }
                        
                        // Load terms without notification
                        this.loadTerms(true);
                    } else {
                        const errorMsg = (response.data && response.data.message) 
                            ? response.data.message 
                            : 'An error occurred while saving the term.';
                        this.forceDisplayNotification(errorMsg, 'error');
                    }
                },
                error: (xhr, status, error) => {
                    console.error('Save term error:', error);
                    this.forceDisplayNotification(
                        BCMAdmin.i18n.save_error || 'Failed to save the term.', 
                        'error'
                    );
                },
                complete: () => {
                    this.setLoading(false);
                }
            });
        }

        /**
         * Show term form
         */
        showTermForm(termData = null) {
            const isNewTerm = !termData;

            if (isNewTerm) {
                this.setLoading(true);
                $.ajax({
                    url: BCMAdmin.ajax_url,
                    method: 'POST',
                    data: {
                        action: 'BCM_get_parent_terms',
                        category: this.state.currentCategory,
                        nonce: BCMAdmin.nonce
                    },
                    success: (response) => {
                        if (response.success) {
                            // Get default prompt from BCMAdmin
                            const defaultPrompt = window.BCMAdmin && window.BCMAdmin.default_ai_prompt ? 
                                window.BCMAdmin.default_ai_prompt : '';
                                
                            const formData = {
                                id: '',
                                name: '',
                                slug: '',
                                description: '',
                                category: this.state.currentCategory,
                                showParent: true,
                                parentDropdown: response.data.parent_dropdown,
                                canDelete: false,
                                isNewTerm: true,
                                default_prompt: defaultPrompt
                            };
                            this.renderTermForm(formData);
                        }
                    },
                    complete: () => {
                        this.setLoading(false);
                    }
                });
            } else {
                const formData = {
                    ...termData,
                    isNewTerm: false
                };
                this.renderTermForm(formData);
            }
        }

        /**
         * Render term form
         */
        renderTermForm(formData) {
            console.group('Rendering Term Form');
            console.log('Form Data:', formData);

            // Ensure proper handling of the default prompt
            if (formData.default_prompt) {
                try {
                    // Decode and clean up the prompt
                    let prompt = formData.default_prompt
                        .replace(/\\(.)/g, '$1') // Remove escaped characters
                        .replace(/\r\n/g, '\n')  // Normalize line endings
                        .trim();

                    // Replace [TERM_NAME] placeholder
                    formData.default_prompt = prompt.replace(
                        /\[TERM_NAME\]/g,
                        formData.name || ''
                    );

                    console.log('Processed prompt:', formData.default_prompt);
                } catch (e) {
                    console.error('Error processing prompt:', e);
                    formData.default_prompt = '';
                }
            }

            // For new terms, get prompt from settings
            if (formData.isNewTerm) {
                if (window.BCMAdmin && window.BCMAdmin.default_ai_prompt) {
                    formData.default_prompt = window.BCMAdmin.default_ai_prompt.replace(
                        /\[TERM_NAME\]/g,
                        formData.name || ''
                    );
                }
            }

            this.elements.termEditor.removeClass('hidden');
            this.elements.termEditor.find('.BCM-term-editor-header h2')
                .text(formData.isNewTerm ? BCMAdmin.i18n.create_term : BCMAdmin.i18n.edit_term);

            // Store the default prompt before rendering
            const defaultPrompt = formData.default_prompt || 
                (window.BCMAdmin && window.BCMAdmin.default_ai_prompt ? 
                window.BCMAdmin.default_ai_prompt.replace(/\[TERM_NAME\]/g, formData.name || '') : '');
console.log(window.BCMAdmin)
            this.elements.editorContent.html(this.templates.termForm(formData));

            // Set the OpenAI prompt value after rendering
            const $promptField = $('#openai-prompt');
            if ($promptField.length) {
                $promptField.val(defaultPrompt);
            }

            if (formData.parent) {
                $('#term-parent').val(formData.parent);
            }

            this.state.hasUnsavedChanges = false;
            $('#term-name').focus();

            console.groupEnd();
        }

        /**
         * Delete term
         */
        deleteTerm() {
            this.setLoading(true);

            $.ajax({
                url: BCMAdmin.ajax_url,
                method: 'POST',
                data: {
                    action: 'BCM_delete_term',
                    term_id: this.state.currentTermId,
                    category: this.state.currentCategory,
                    nonce: BCMAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        this.hideTermEditor();
                        this.loadTerms();
                        this.showSuccess(response.data.message);
                    } else {
                        this.showError(response.data.message);
                    }
                },
                error: () => {
                    this.showError(BCMAdmin.i18n.delete_error);
                },
                complete: () => {
                    this.setLoading(false);
                }
            });
        }

        /**
         * Generate description using OpenAI
         */
        generateDescription() {
            if (!BCMAdmin.has_api_key) {
                this.showError(BCMAdmin.i18n.api_key_missing);
                return;
            }

            const button = $('#generate-description');
            const spinner = button.find('.spinner');
            const prompt = $('#openai-prompt').val();
            const termName = $('#term-name').val();

            button.prop('disabled', true);
            spinner.addClass('is-active');

            $.ajax({
                url: BCMAdmin.ajax_url,
                method: 'POST',
                data: {
                    action: 'BCM_generate_description',
                    prompt: prompt,
                    term_name: termName,
                    nonce: BCMAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        $('#term-description').val(response.data.description);
                        this.state.hasUnsavedChanges = true;
                    } else {
                        this.showError(response.data.message);}
                },
                error: () => {
                    this.showError(BCMAdmin.i18n.generate_error);
                },
                complete: () => {
                    button.prop('disabled', false);
                    spinner.removeClass('is-active');
                }
            });
        }

        /**
         * Show a notification banner
         * @param {string} message - The message to display
         * @param {string} type - Type of notification: 'success', 'error', 'warning', 'info'
         * @param {number} duration - Time in milliseconds before auto-dismiss, 0 for no auto-dismiss
         */
        showNotification(message, type = 'info', duration = 3000) {
            try {
                if (!this.elements.notificationContainer || !this.elements.notificationContainer.length) {
                    console.warn('Notification container not found, creating one');
                    $('body').prepend('<div id="BCM-notification-container" class="BCM-notification-container"></div>');
                    this.elements.notificationContainer = $('#BCM-notification-container');
                }
                
                const $notification = $(`
                    <div class="BCM-notification BCM-notification-${type}">
                        <div class="BCM-notification-content">
                            <span class="BCM-notification-message">${message}</span>
                        </div>
                        <button type="button" class="BCM-notification-close">
                            <span class="dashicons dashicons-no-alt"></span>
                        </button>
                    </div>
                `);

                this.elements.notificationContainer.append($notification);

                // Add close button handler
                $notification.find('.BCM-notification-close').on('click', () => {
                    this.dismissNotification($notification);
                });

                // Auto-dismiss after duration (if not 0)
                if (duration > 0) {
                    setTimeout(() => {
                        this.dismissNotification($notification);
                    }, duration);
                }
            } catch (error) {
                console.error('Error showing notification:', error, message);
                alert(message); // Fallback to alert if notification fails
            }
        }
        
        /**
         * Dismiss a notification with animation
         * @param {jQuery} $notification - The notification element to dismiss
         */
        dismissNotification($notification) {
            if ($notification.length) {
                $notification.addClass('BCM-fadeout');
                setTimeout(() => {
                    $notification.remove();
                }, 500); // Match animation duration
            }
        }
        
        /**
         * Show success notification
         * @param {string} message - Success message
         */
        showSuccess(message) {
            console.log('Success notification:', message);
            this.showNotification(message, 'success');
        }
        
        /**
         * Show error message
         * @param {string} message - Error message
         */
        showError(message) {
            try {
                this.showNotification(message, 'error', 0);
            } catch (error) {
                console.error('Error showing error notification:', error);
                alert(message); // Fallback to alert
            }
        }

        /**
         * Force display of a notification bypassing all checks
         * Direct approach to ensure notification appears
         */
        forceDisplayNotification(message, type = 'info', duration = 3000) {
            console.log('Force displaying notification:', message, type);
            
            // Make sure container exists
            if (!$('#BCM-notification-container').length) {
                console.log('Creating notification container');
                $('.wrap').prepend('<div id="BCM-notification-container" class="BCM-notification-container"></div>');
            }
            
            // Create notification element with unique ID
            const notificationId = 'notification-' + Date.now();
            const notificationClass = 'BCM-notification BCM-notification-' + type;
            
            const notificationHtml = `
                <div id="${notificationId}" class="${notificationClass}">
                    <div class="BCM-notification-content">${message}</div>
                    <div class="BCM-notification-close">&times;</div>
                </div>
            `;
            
            // Add to container with direct jQuery
            $('#BCM-notification-container').append(notificationHtml);
            
            // Get notification element
            const $notification = $(`#${notificationId}`);
            
            // Setup close button
            $notification.find('.BCM-notification-close').on('click', function() {
                $notification.addClass('BCM-fadeout');
                setTimeout(function() {
                    $notification.remove();
                }, 500);
            });
            
            // Auto-dismiss after duration
            if (duration > 0) {
                setTimeout(function() {
                    if ($notification.length) {
                        $notification.addClass('BCM-fadeout');
                        setTimeout(function() {
                            $notification.remove();
                        }, 500);
                    }
                }, duration);
            }
        }

        /**
         * Collapse all first level terms
         */
        collapseAllFirstLevel() {
            console.log('Collapsing all first level terms');
            
            let collapsed = 0;
            
            // Find all first level terms with children
            $('#category-terms-tree > ul.BCM-term-list > li').each((_, item) => {
                // Find the toggle button 
                const $termRow = $(item).children('.BCM-term-row');
                const $toggleBtn = $termRow.find('.BCM-toggle-children');
                
                // Only process items that have the toggle button (meaning they have children)
                if ($toggleBtn.length && !$toggleBtn.hasClass('BCM-toggle-placeholder')) {
                    const $childList = $(item).children('ul.BCM-term-list');
                    
                    if ($childList.length && $childList.is(':visible')) {
                        // Hide children with animation
                        $childList.slideUp(200);
                        
                        // Update toggle icon
                        const $icon = $toggleBtn.find('.dashicons');
                        $icon.removeClass('dashicons-arrow-down').addClass('dashicons-arrow-right');
                        
                        // Update state
                        const termId = $termRow.data('id');
                        if (termId) {
                            this.state.expandedTerms.delete(termId);
                        }
                        
                        collapsed++;
                    }
                }
            });
            
            console.log(`Collapsed ${collapsed} term groups`);
            
            // Hide collapse button and show expand button
            this.elements.collapseAllBtn.hide();
            this.elements.expandAllBtn.show();
        }
        
        /**
         * Expand all first level terms
         */
        expandAllFirstLevel() {
            console.log('Expanding all first level terms');
            
            let expanded = 0;
            
            // Find all first level terms with children
            $('#category-terms-tree > ul.BCM-term-list > li').each((_, item) => {
                // Find the toggle button 
                const $termRow = $(item).children('.BCM-term-row');
                const $toggleBtn = $termRow.find('.BCM-toggle-children');
                
                // Only process items that have the toggle button (meaning they have children)
                if ($toggleBtn.length && !$toggleBtn.hasClass('BCM-toggle-placeholder')) {
                    const $childList = $(item).children('ul.BCM-term-list');
                    
                    if ($childList.length && !$childList.is(':visible')) {
                        // Show children with animation
                        $childList.slideDown(200);
                        
                        // Update toggle icon
                        const $icon = $toggleBtn.find('.dashicons');
                        $icon.removeClass('dashicons-arrow-right').addClass('dashicons-arrow-down');
                        
                        // Update state
                        const termId = $termRow.data('id');
                        if (termId) {
                            this.state.expandedTerms.add(termId);
                        }
                        
                        expanded++;
                    }
                }
            });
            
            console.log(`Expanded ${expanded} term groups`);
            
            // Show collapse button and hide expand button
            this.elements.collapseAllBtn.show();
            this.elements.expandAllBtn.hide();
        }

        /**
         * Utility Methods
         */
        setLoading(loading) {
            try {
                if (!this.state) {
                    return;
                }
                
                this.state.isLoading = loading;
                
                // Use a safer approach to toggle loading overlay
                if (this.elements && this.elements.loadingOverlay && this.elements.loadingOverlay.length) {
                    if (loading) {
                        this.elements.loadingOverlay.removeClass('hidden');
                    } else {
                        this.elements.loadingOverlay.addClass('hidden');
                    }
                }
        
                // Use a safer approach to disable/enable buttons
                try {
                    $('button').prop('disabled', loading);
                } catch (e) {
                    console.warn('Error toggling button states:', e);
                }
            } catch (error) {
                console.error('Error in setLoading:', error);
            }
        }

        hideTermEditor() {
            this.elements.termEditor.addClass('hidden');
            this.state.currentTermId = null;
            this.state.hasUnsavedChanges = false;
        }

        /**
         * Clean up when destroying the editor
         */
        destroy() {
            // Remove event listeners
            this.elements.categorySelect.off();
            this.elements.termSearch.off();
            this.elements.addNewBtn.off();
            this.elements.termsTree.off();
            this.elements.closeEditorBtn.off();

            // Destroy sortable
            $('.BCM-terms-tree .BCM-term-list').sortable('destroy');

            // Remove document event handlers
            $(document).off('submit', '#BCM-term-edit-form');
            $(document).off('click', '.BCM-cancel-edit');
            $(document).off('click', '.BCM-delete-term');
            $(document).off('click', '#generate-description');
            $(document).off('change input', '#BCM-term-edit-form input, #BCM-term-edit-form textarea, #BCM-term-edit-form select');

            // Clear state
            this.state = null;
            this.elements = null;
            this.templates = null;
        }

        getFormData(form) {
            const formData = {};
            const serializedData = form.serializeArray();

            serializedData.forEach(item => {
                // Handle multiple values (like checkboxes)
                if (formData[item.name]) {
                    if (!Array.isArray(formData[item.name])) {
                        formData[item.name] = [formData[item.name]];
                    }
                    formData[item.name].push(item.value);
                } else {
                    formData[item.name] = item.value;
                }
            });

            return formData;
        }

        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }
    }

    // Initialize when document is ready
    $(document).ready(function() {
        // Create a safer initialization function with better error handling
        function initCategoryEditor() {
            try {
                // Make sure dependencies are available
                if (typeof wp === 'undefined' || typeof wp.template !== 'function') {
                    console.error('WordPress template system not available');
                    setTimeout(initCategoryEditor, 100); // Try again later
                    return;
                }
                
                // Check for required template elements
                if ($('#tmpl-BCM-term-row').length === 0 || $('#tmpl-BCM-term-form').length === 0) {
                    console.error('Required template elements not found in DOM');
                    return;
                }
                
                // Ignore storage access errors - they're not critical for functionality
                window.addEventListener('error', function(e) {
                    if (e.message && e.message.indexOf('storage') !== -1) {
                        console.warn('Storage access error ignored:', e.message);
                        e.stopPropagation();
                        return true; // Prevent default error handling
                    }
                }, true);
                
                // Create editor instance
                window.BCMCategoryEditor = new CategoryEditor();
                
                // Only initialize if creation was successful
                if (window.BCMCategoryEditor) {
                    window.BCMCategoryEditor.init();
                    
                    // Handle unsaved changes warning without using storage
                    $(window).on('beforeunload', function(e) {
                        if (window.BCMCategoryEditor && 
                            window.BCMCategoryEditor.state && 
                            window.BCMCategoryEditor.state.hasUnsavedChanges) {
                            e.preventDefault();
                            return '';
                        }
                    });
                }
            } catch (error) {
                console.error('Error initializing Category Editor:', error);
            }
        }
        
        // Start initialization with a short delay to ensure templates are ready
        setTimeout(initCategoryEditor, 100);
    });
})(jQuery);