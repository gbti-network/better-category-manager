/**
 * BCATM Category Editor JavaScript
 */
(function($) {
    'use strict';

    /**
     * BCATM Category Editor Class
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
                    termRow: wp.template('BCATM-term-row'),
                    termForm: wp.template('BCATM-term-form')
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
                termSearch: $('#term-search'),
                addNewBtn: $('#add-new-term'),
                termsTree: $('#category-terms-tree'),
                termEditor: $('.BCATM-term-editor'),
                closeEditorBtn: $('.BCATM-close-editor'),
                editorContent: $('.BCATM-term-editor-content'),
                container: $('.BCATM-terms-tree'),
                notificationContainer: $('#BCATM-notification-container'),
                loadingOverlay: $('.BCATM-loading-overlay'),
                collapseAllBtn: $('.BCATM-collapse-all'),
                expandAllBtn: $('.BCATM-expand-all')
            };
            
            // Create loading overlay if it doesn't exist
            if (!this.elements.loadingOverlay || !this.elements.loadingOverlay.length) {
                console.warn('Loading overlay not found, creating one');
                this.elements.container.append('<div class="BCATM-loading-overlay"><span class="spinner is-active"></span></div>');
                this.elements.loadingOverlay = $('.BCATM-loading-overlay');
            }
        }

        /**
         * Initialize state
         */
        initializeState() {
            this.state = {
                currentCategory: 'category', // Always set to 'category' for Better Category Manager
                currentTermId: null,
                expandedTerms: new Set(),
                isDragging: false,
                hasUnsavedChanges: false,
                contentLoaded: false, // Track if content has been loaded
                initialLoadComplete: false, // Track if initial load is complete
                isHierarchical: true, // Track if the current category is hierarchical
                isLoading: false,
                showPostCounts: false // Store the show_post_counts setting
            };
        }

        /**
         * Initialize the editor
         */
        init() {
            // Validate dependencies
            if (typeof BCATMAdmin === 'undefined') {
                console.error('BCATMAdmin is not defined. Cannot initialize editor.');
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
                // Term search
                this.elements.termSearch.on('input', this.debounce(() => {
                    this.filterTerms(this.elements.termSearch.val());
                }, 300));

                // Add new term
                this.elements.addNewBtn.on('click', () => this.showTermForm());

                // Term tree events
                this.elements.termsTree.on('click', '.BCATM-toggle-children', (e) => {
                    e.stopPropagation();
                    const termRow = $(e.target).closest('.BCATM-term-row');
                    this.toggleChildren(termRow);
                });

                this.elements.termsTree.on('click', '.BCATM-edit-term', (e) => {
                    e.stopPropagation();
                    const termId = $(e.target).closest('.BCATM-term-row').data('id');
                    this.loadTermData(termId);
                });

                // Delete term with confirmation
                this.elements.termsTree.on('click', '.BCATM-quick-delete', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Make sure we get the actual button even if the icon or text was clicked
                    const button = $(e.target).hasClass('BCATM-quick-delete') 
                        ? $(e.target) 
                        : $(e.target).closest('.BCATM-quick-delete');
                        
                    const termRow = button.closest('.BCATM-term-row');
                    const termId = termRow.data('id');
                    const termName = termRow.find('.BCATM-term-name').text().trim();
                    
                    // Debug the selected elements
                    console.log('Delete button clicked for:', {
                        termId: termId,
                        termName: termName,
                        isConfirmMode: button.hasClass('confirm-delete')
                    });
                    
                    // If already in confirmation mode
                    if (button.hasClass('confirm-delete')) {
                        // Perform delete
                        this.deleteTermById(termId, termName);
                    } else {
                        // Enter confirmation mode
                        button.addClass('confirm-delete');
                        button.attr('title', BCATMAdmin.i18n.click_confirm_delete || 'Click again to confirm deletion');
                        button.find('.dashicons').removeClass('dashicons-trash').addClass('dashicons-warning');
                        
                        // Add confirm text
                        if (!button.find('.confirm-text').length) {
                            button.append('<span class="confirm-text">' + (BCATMAdmin.i18n.confirm_deletion || 'Confirm Deletion') + '</span>');
                        }
                        
                        // Reset after 3 seconds
                        setTimeout(() => {
                            if (button.hasClass('confirm-delete')) {
                                button.removeClass('confirm-delete');
                                button.attr('title', BCATMAdmin.i18n.delete_term || 'Delete this term');
                                button.find('.dashicons').removeClass('dashicons-warning').addClass('dashicons-trash');
                                button.find('.confirm-text').remove();
                            }
                        }, 3000);
                    }
                });

                // Close editor
                this.elements.closeEditorBtn.on('click', () => {
                    if (this.state.hasUnsavedChanges) {
                        if (confirm(BCATMAdmin.i18n.unsaved_changes || 'There are unsaved changes. Do you want to discard them?')) {
                            this.state.hasUnsavedChanges = false;
                            this.hideTermEditor();
                        }
                    } else {
                        this.hideTermEditor();
                    }
                });

                // Editor form events
                $(document).on('submit', '#BCATM-term-edit-form', (e) => {
                    e.preventDefault();
                    this.saveTerm();
                });

                $(document).on('click', '.BCATM-delete-term', (e) => {
                    e.preventDefault();
                    if (confirm(BCATMAdmin.i18n.confirm_delete)) {
                        this.deleteTerm();
                    }
                });

                // OpenAI description generation
                $(document).on('click', '#generate-description', (e) => {
                    e.preventDefault();
                    this.generateDescription();
                });

                // Track changes
                $(document).on('change input', '#BCATM-term-edit-form input, #BCATM-term-edit-form textarea, #BCATM-term-edit-form select', () => {
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
            
            BCATM.debug.group('Loading terms for category: ' + category);
            
            $.ajax({
                url: BCATMAdmin.ajax_url,
                type: 'POST',
                dataType: 'json',
                data: {
                    action: 'BCATM_get_terms',
                    nonce: BCATMAdmin.nonce,
                    category: category
                },
                success: (response) => {
                    if (response.success) {
                        BCATM.debug.log('Terms loaded successfully', response.data);
                        
                        // Update is_hierarchical state
                        this.state.isHierarchical = response.data.is_hierarchical;
                        
                        // Show/hide tree controls based on hierarchical status
                        if (this.state.isHierarchical) {
                            $('.BCATM-tree-controls').show();
                        } else {
                            $('.BCATM-tree-controls').hide();
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
                    BCATM.debug.groupEnd();
                }
            });
        }

        /**
         * Render terms in the tree view
         */
        renderTerms(terms) {
            BCATM.debug.group('Rendering terms');
            
            // Get the category info from the first term if available
            if (terms && terms.length > 0 && terms[0].category_info) {
                this.state.isHierarchical = terms[0].category_info.hierarchical;
                BCATM.debug.log('Category hierarchical status:', this.state.isHierarchical);
                
                // Add a class to the container to indicate hierarchy status
                if (this.state.isHierarchical) {
                    this.elements.container.addClass('BCATM-hierarchical-category');
                    this.elements.container.removeClass('BCATM-flat-category');
                    $('.BCATM-tree-controls').show(); // Show expand/collapse controls for hierarchical taxonomies
                } else {
                    this.elements.container.addClass('BCATM-flat-category');
                    this.elements.container.removeClass('BCATM-hierarchical-category');
                    $('.BCATM-tree-controls').hide(); // Hide expand/collapse controls for non-hierarchical taxonomies
                }
            }
            
            this.elements.termsTree.empty();

            if (!terms || !terms.length) {
                this.elements.termsTree.html(
                    `<p class="BCATM-no-terms">${BCATMAdmin.i18n.no_terms}</p>`
                );
                return;
            }

            // Store the show_post_counts setting from the response
            this.state.showPostCounts = BCATMAdmin.show_post_counts;
            
            // Add a class to the container based on the show_post_counts setting
            if (this.state.showPostCounts) {
                this.elements.container.addClass('BCATM-show-counts');
                this.elements.container.removeClass('BCATM-hide-counts');
            } else {
                this.elements.container.addClass('BCATM-hide-counts');
                this.elements.container.removeClass('BCATM-show-counts');
            }

            const createTermTree = (terms, parent = 0) => {
                const children = terms.filter(term => term.parent === parent);
                if (!children.length) return '';

                const ul = $('<ul class="BCATM-term-list"></ul>');
                children.forEach(term => {
                    const hasChildren = terms.some(t => t.parent === term.id);
                    const termHtml = this.templates.termRow({
                        id: term.id,
                        name: term.name,
                        count: term.count || 0,
                        hasChildren: hasChildren,
                        parent: term.parent,
                        canDelete: true
                    });

                    const li = $('<li></li>').html(termHtml);
                    if (hasChildren) {
                        const childrenContainer = createTermTree(terms, term.id);
                        if (this.state.expandedTerms.has(term.id)) {
                            childrenContainer.show();
                            li.find('.BCATM-toggle-children .dashicons')
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
                BCATM.debug.log('Skipping drag and drop for non-hierarchical category');
                // Disable drag handles for non-hierarchical taxonomies
                this.elements.termsTree.find('.BCATM-term-handle').addClass('BCATM-disabled').attr('title', 'Drag and drop not available for non-hierarchical taxonomies');
            }
            
            BCATM.debug.groupEnd();
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
                
                // Skip if category is not hierarchical
                if (!this.state.isHierarchical) {
                    console.log('Skipping drag and drop initialization for non-hierarchical category');
                    return;
                }
                
                console.log('Initializing drag and drop');
                
                const self = this;
                
                $('.BCATM-terms-tree .BCATM-term-list').sortable({
                    handle: '.BCATM-term-handle',
                    items: '> li',
                    placeholder: 'BCATM-sortable-placeholder',
                    tolerance: 'pointer',
                    cursor: 'move',
                    connectWith: '.BCATM-term-list',
                    delay: 150,
                    helper: 'clone',
                    grid: [20, 1],

                    start: (e, ui) => {
                        console.log('Drag Start');
                        const $item = ui.item;
                        const $itemRow = $item.find('.BCATM-term-row');
                        const itemOffset = $itemRow.offset();

                        this.state.isDragging = true;
                        this.state.mouseTracking = {
                            startX: e.pageX,
                            currentX: e.pageX,
                            startOffset: itemOffset
                        };
                        this.state.currentItemId = $itemRow.data('id');

                        ui.placeholder.height(ui.item.height());
                        $itemRow.addClass('is-dragging');
                    },

                    sort: (e, ui) => {
                        const $placeholder = ui.placeholder;
                        const dragDistance = e.pageX - this.state.mouseTracking.startX;
                        const mouseY = e.pageY;
                        const draggedItemId = ui.item.find('.BCATM-term-row').data('id');

                        // Clear previous visual indicators
                        $('.BCATM-term-row').removeClass('potential-parent hover-target');
                        $('.temp-drop-container').removeClass('active');
                        $('.nesting-helper').remove();

                        // Find potential parent based on mouse position
                        const $potentialParents = $('.BCATM-term-row').filter(function() {
                            const $this = $(this);
                            const thisOffset = $this.offset();
                            const isAboveMouse = thisOffset.top < mouseY;
                            const isWithinHorizontalRange = Math.abs(thisOffset.left - $placeholder.offset().left) < 50;
                            const isNotDraggedItem = $this.data('id') !== draggedItemId;
                            const isNotChild = !$this.closest('li').find(`[data-id="${draggedItemId}"]`).length;

                            return isAboveMouse && isWithinHorizontalRange && isNotDraggedItem && isNotChild;
                        });

                        let closestParent = null;
                        let closestDistance = Infinity;

                        $potentialParents.each(function() {
                            const $this = $(this);
                            const thisOffset = $this.offset();
                            const distance = Math.sqrt(
                                Math.pow(mouseY - thisOffset.top, 2) +
                                Math.pow(e.pageX - thisOffset.left, 2)
                            );

                            if (distance < closestDistance) {
                                closestDistance = distance;
                                closestParent = $this;
                            }
                        });

                        // Apply nesting visual indicators if dragging right
                        if (closestParent && dragDistance > 100) {
                            const potentialParentId = closestParent.data('id');

                            // Store the potential parent for use in stop handler
                            this.state.potentialParentId = potentialParentId;

                            // Apply visual indicators
                            closestParent.addClass('potential-parent hover-target');
                            $placeholder.addClass('is-child-indent').css('margin-left', '20px');

                            // Add or update drop container
                            let $dropContainer = closestParent.next('.BCATM-term-list');
                            if (!$dropContainer.length) {
                                $dropContainer = $('<ul class="BCATM-term-list temp-drop-container"></ul>');
                                closestParent.after($dropContainer);
                            }
                            $dropContainer.addClass('active');

                            // Add helper text
                            if (!closestParent.find('.nesting-helper').length) {
                                closestParent.append(
                                    '<span class="nesting-helper">Release to nest under ' +
                                    closestParent.find('.BCATM-term-name').text() + '</span>'
                                );
                            }
                        } else {
                            // Reset nesting state when not dragging right
                            this.state.potentialParentId = null;
                            $placeholder.removeClass('is-child-indent').css('margin-left', '');
                        }
                    },

                    stop: (e, ui) => {
                        const $item = ui.item;
                        const dragDistance = e.pageX - this.state.mouseTracking.startX;
                        let newParentId = 0;

                        // Use the stored potential parent if we were dragging right
                        if (this.state.potentialParentId && dragDistance > 100) {
                            newParentId = this.state.potentialParentId;
                            const $parent = $(`.BCATM-term-row[data-id="${newParentId}"]`);

                            // Create or get child list
                            let $childList = $parent.next('.BCATM-term-list:not(.temp-drop-container)');
                            if (!$childList.length) {
                                $childList = $('<ul class="BCATM-term-list"></ul>');
                                $parent.after($childList);
                            }

                            // Move item to child list
                            $item.appendTo($childList);

                            // Update toggle button
                            this.updateToggleButton($parent);
                        } else {
                            // If not nesting, parent is determined by the containing list
                            const $parentRow = $item.parent('.BCATM-term-list').prev('.BCATM-term-row');
                            newParentId = $parentRow.length ? $parentRow.data('id') : 0;
                        }

                        // Cleanup
                        $('.BCATM-term-row').removeClass('potential-parent hover-target is-dragging');
                        $('.temp-drop-container').removeClass('active');
                        $('.nesting-helper').remove();

                        // Update hierarchy
                        this.updateTermHierarchy($item, newParentId);

                        // Reset state
                        this.state.mouseTracking = { startX: 0, currentX: 0 };
                        this.state.potentialParentId = null;
                    }
                }).disableSelection();
                
                // Log success message
                console.log('Drag and drop initialized successfully');
            } catch (error) {
                console.error('Failed to initialize drag and drop:', error);
            }
        }

        /**
         * Helper method to update toggle button
         */
        updateToggleButton($parent) {
            const $existing = $parent.find('.BCATM-toggle-children');
            const hasChildren = $parent.next('.BCATM-term-list').children().length > 0;

            if (!hasChildren) {
                // If no children, remove the toggle button and replace with placeholder
                if ($existing.length && !$existing.hasClass('BCATM-toggle-placeholder')) {
                    $existing.replaceWith('<span class="BCATM-toggle-placeholder"></span>');
                }
            } else {
                // If has children, ensure toggle button exists and is in correct state
                if (!$existing.length || $existing.hasClass('BCATM-toggle-placeholder')) {
                    $parent.find('.BCATM-toggle-placeholder').replaceWith(`
                <button type="button" class="BCATM-toggle-children expanded" title="Toggle children visibility">
                    <span class="dashicons dashicons-arrow-down"></span>
                </button>
            `);
                } else {
                    $existing.addClass('expanded')
                        .find('.dashicons')
                        .addClass('dashicons-arrow-down')
                        .removeClass('dashicons-arrow-right');
                }
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
            console.log('Term ID:', $item.find('.BCATM-term-row').data('id'));
            console.log('New parent ID:', newParentId);
            
            this.setLoading(true);

            $.ajax({
                url: BCATMAdmin.ajax_url,
                method: 'POST',
                data: {
                    action: 'BCATM_update_term_hierarchy',
                    term_id: $item.find('.BCATM-term-row').data('id'),
                    parent_id: newParentId,
                    category: this.state.currentCategory,
                    nonce: BCATMAdmin.nonce
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
                                BCATMAdmin.i18n.term_updated || 'Term updated successfully.', 
                                'success'
                            );
                        }
                        
                        // Load terms without notification
                        this.loadTerms(true);
                    }
                },
                error: (xhr, status, error) => {
                    console.error('Ajax error:', {xhr, status, error});
                    this.showError(BCATMAdmin.i18n.hierarchy_update_error);
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
            $('.BCATM-terms-tree .BCATM-term-list').each((_, list) => {
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
            const childrenContainer = termRow.next('.BCATM-term-list');
            const toggleBtn = termRow.find('.BCATM-toggle-children .dashicons');

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
            const terms = this.elements.termsTree.find('.BCATM-term-row');

            terms.each((_, term) => {
                const $term = $(term);
                const termName = $term.find('.BCATM-term-name').text().toLowerCase();
                const isMatch = termName.includes(searchLower);

                if (isMatch) {
                    $term.show();
                    // Show parents
                    $term.parents('.BCATM-term-list').show();
                    $term.parents('.BCATM-term-row').show();
                } else {
                    // Only hide if no children match
                    const hasMatchingChild = $term.next('.BCATM-term-list')
                        .find('.BCATM-term-name')
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
                !confirm(BCATMAdmin.i18n.unsaved_changes || 'There are unsaved changes. Do you want to discard them?')) {
                return;
            }

            this.setLoading(true);
            this.state.currentTermId = termId;

            $.ajax({
                url: BCATMAdmin.ajax_url,
                method: 'POST',
                data: {
                    action: 'BCATM_get_term_data',
                    term_id: termId,
                    category: this.state.currentCategory,
                    nonce: BCATMAdmin.nonce
                },
                success: (response) => {
                    if (response.success && response.data) {
                        // Log the response to verify data
                        console.log('Term data received:', response.data);
                        
                        // New structure has term object and parent_terms
                        const termData = response.data.term || {};
                        const parentDropdown = response.data.parent_terms || '';
                        
                        // Safely check for required properties
                        if (!termData || typeof termData !== 'object') {
                            console.error('Term data is missing or invalid in the response', response);
                            this.showError('Invalid term data received. Please try again.');
                            return;
                        }
                        
                        // Get category info
                        const categoryInfo = response.data.category || {};
                        const showParent = categoryInfo.hierarchical !== undefined ? 
                            !!categoryInfo.hierarchical : this.state.isHierarchical;
                        
                        // Get the default prompt - prioritize the dedicated default_ai_prompt property
                        const defaultPrompt = window.BCATMAdmin && window.BCATMAdmin.default_ai_prompt ? 
                            window.BCATMAdmin.default_ai_prompt : '';
                        
                        // Format the data for the form template
                        const formData = {
                            id: termData.id || 0,
                            name: termData.name || '',
                            slug: termData.slug || '',
                            description: termData.description || '',
                            category: termData.taxonomy || this.state.currentCategory,
                            parent: termData.parent || 0,
                            showParent: showParent,
                            parentDropdown: parentDropdown,
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
                    this.showError(BCATMAdmin.i18n.error_loading || 'Failed to load term data');
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
            const formData = new FormData($('#BCATM-term-edit-form')[0]);
            formData.append('action', 'BCATM_save_term');
            formData.append('nonce', BCATMAdmin.nonce);

            this.setLoading(true);

            $.ajax({
                url: BCATMAdmin.ajax_url,
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
                                BCATMAdmin.i18n.term_updated || 'Term updated successfully.', 
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
                        BCATMAdmin.i18n.save_error || 'Failed to save the term.', 
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
                    url: BCATMAdmin.ajax_url,
                    method: 'POST',
                    data: {
                        action: 'BCATM_get_parent_terms',
                        category: this.state.currentCategory,
                        nonce: BCATMAdmin.nonce
                    },
                    success: (response) => {
                        if (response.success) {
                            // Get default prompt from BCATMAdmin
                            const defaultPrompt = window.BCATMAdmin && window.BCATMAdmin.default_ai_prompt ? 
                                window.BCATMAdmin.default_ai_prompt : '';
                                
                            const formData = {
                                id: '',
                                name: '',
                                slug: '',
                                description: '',
                                category: this.state.currentCategory,
                                showParent: true,
                                parentDropdown: response.data.parent_dropdown || '',
                                canDelete: false,
                                isNewTerm: true,
                                default_prompt: defaultPrompt
                            };
                            this.renderTermForm(formData);
                        } else {
                            const errorMsg = response.data && response.data.message ? 
                                response.data.message : 
                                'Failed to load parent categories. Please try again.';
                            this.showError(errorMsg);
                        }
                    },
                    error: (xhr, status, error) => {
                        console.error('Ajax error:', {xhr, status, error});
                        this.showError('Failed to load parent categories. Please try again.');
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

            this.elements.termEditor.removeClass('hidden');
            this.elements.termEditor.find('.BCATM-term-editor-header h2')
                .text(formData.isNewTerm ? BCATMAdmin.i18n.create_term : BCATMAdmin.i18n.edit_term);

            // Store the default prompt before rendering
            const defaultPrompt = formData.default_prompt || 
                (window.BCATMAdmin && window.BCATMAdmin.default_ai_prompt ? 
                window.BCATMAdmin.default_ai_prompt.replace(/\[TERM_NAME\]/g, formData.name || '') : '');
console.log(window.BCATMAdmin)
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
                url: BCATMAdmin.ajax_url,
                method: 'POST',
                data: {
                    action: 'BCATM_delete_term',
                    term_id: this.state.currentTermId,
                    category: this.state.currentCategory,
                    nonce: BCATMAdmin.nonce
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
                    this.showError(BCATMAdmin.i18n.delete_error);
                },
                complete: () => {
                    this.setLoading(false);
                }
            });
        }

        /**
         * Delete a term by ID
         * 
         * @param {number} termId - ID of the term to delete
         * @param {string} termName - Name of the term for notification
         */
        deleteTermById(termId, termName) {
            if (!termId) {
                console.error('Cannot delete term: Invalid term ID');
                this.showError(BCATMAdmin.i18n.delete_failed || 'Failed to delete term: Invalid ID');
                return;
            }
            
            console.log('Deleting term:', { termId, taxonomy: this.state.currentCategory });
            this.setLoading(true);
            
            $.ajax({
                url: BCATMAdmin.ajax_url,
                type: 'POST',
                data: {
                    action: 'BCATM_delete_term',
                    term_id: termId,
                    category: this.state.currentCategory,
                    nonce: BCATMAdmin.nonce
                },
                dataType: 'json',
                success: (response) => {
                    console.log('Delete term response:', response);
                    
                    if (response.success) {
                        // Remove the term from the UI
                        const termRow = this.elements.termsTree.find(`.BCATM-term-row[data-id="${termId}"]`);
                        if (!termRow.length) {
                            console.error('Could not find term row to delete with ID:', termId);
                            // Reload the full tree to ensure the UI is in sync
                            this.loadTerms();
                            this.showNotification(`${termName} ${BCATMAdmin.i18n.term_deleted || 'has been deleted'}.`, 'success');
                            return;
                        }
                        
                        // Check if it's a parent or child term and remove appropriately
                        const parentLi = termRow.closest('li');
                        const childrenList = termRow.next('.BCATM-term-list');
                        const hasChildren = childrenList.length > 0 && childrenList.children().length > 0;
                        
                        console.log('Term UI structure:', {
                            hasParentLi: parentLi.length > 0,
                            hasChildren: hasChildren,
                            childrenAction: response.data?.children_action
                        });
                        
                        // If term has children or we need a full refresh
                        if (hasChildren || (response.data && response.data.children_action === 'moved')) {
                            // Refresh the entire tree to show the new structure
                            this.loadTerms();
                        } else {
                            // Just remove this term node
                            if (parentLi.length) {
                                parentLi.remove();
                            } else {
                                termRow.remove();
                            }
                        }
                        
                        this.showNotification(`${termName} ${BCATMAdmin.i18n.term_deleted || 'has been deleted'}.`, 'success');
                    } else {
                        console.error('Server returned error when deleting term:', response.data?.message);
                        this.showError(response.data?.message || BCATMAdmin.i18n.delete_failed || 'Failed to delete term.');
                    }
                },
                error: (xhr, status, error) => {
                    console.error('AJAX error when deleting term:', {
                        status: status,
                        error: error,
                        response: xhr.responseText
                    });
                    this.showError(`${BCATMAdmin.i18n.delete_failed || 'Failed to delete term'}: ${error}`);
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
            if (!BCATMAdmin.has_api_key) {
                this.showError(BCATMAdmin.i18n.api_key_missing);
                return;
            }

            const button = $('#generate-description');
            const spinner = button.find('.spinner');
            const prompt = $('#openai-prompt').val();
            const termName = $('#term-name').val();

            button.prop('disabled', true);
            spinner.addClass('is-active');

            $.ajax({
                url: BCATMAdmin.ajax_url,
                method: 'POST',
                data: {
                    action: 'BCATM_generate_description',
                    prompt: prompt,
                    term_name: termName,
                    nonce: BCATMAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        $('#term-description').val(response.data.description);
                        this.state.hasUnsavedChanges = true;
                    } else {
                        this.showError(response.data.message);}
                },
                error: () => {
                    this.showError(BCATMAdmin.i18n.generate_error);
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
                    $('body').prepend('<div id="BCATM-notification-container" class="BCATM-notification-container"></div>');
                    this.elements.notificationContainer = $('#BCATM-notification-container');
                }
                
                const $notification = $(`
                    <div class="BCATM-notification BCATM-notification-${type}">
                        <div class="BCATM-notification-content">
                            <span class="BCATM-notification-message">${message}</span>
                        </div>
                        <button type="button" class="BCATM-notification-close">
                            <span class="dashicons dashicons-no-alt"></span>
                        </button>
                    </div>
                `);

                this.elements.notificationContainer.append($notification);

                // Add close button handler
                $notification.find('.BCATM-notification-close').on('click', () => {
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
                $notification.addClass('BCATM-fadeout');
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
            if (!$('#BCATM-notification-container').length) {
                console.log('Creating notification container');
                $('.wrap').prepend('<div id="BCATM-notification-container" class="BCATM-notification-container"></div>');
            }
            
            // Create notification element with unique ID
            const notificationId = 'notification-' + Date.now();
            const notificationClass = 'BCATM-notification BCATM-notification-' + type;
            
            const notificationHtml = `
                <div id="${notificationId}" class="${notificationClass}">
                    <div class="BCATM-notification-content">${message}</div>
                    <div class="BCATM-notification-close">&times;</div>
                </div>
            `;
            
            // Add to container with direct jQuery
            $('#BCATM-notification-container').append(notificationHtml);
            
            // Get notification element
            const $notification = $(`#${notificationId}`);
            
            // Setup close button
            $notification.find('.BCATM-notification-close').on('click', function() {
                $notification.addClass('BCATM-fadeout');
                setTimeout(function() {
                    $notification.remove();
                }, 500);
            });
            
            // Auto-dismiss after duration
            if (duration > 0) {
                setTimeout(function() {
                    if ($notification.length) {
                        $notification.addClass('BCATM-fadeout');
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
            $('#category-terms-tree > ul.BCATM-term-list > li').each((_, item) => {
                // Find the toggle button 
                const $termRow = $(item).children('.BCATM-term-row');
                const $toggleBtn = $termRow.find('.BCATM-toggle-children');
                
                // Only process items that have the toggle button (meaning they have children)
                if ($toggleBtn.length && !$toggleBtn.hasClass('BCATM-toggle-placeholder')) {
                    const $childList = $(item).children('ul.BCATM-term-list');
                    
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
            $('#category-terms-tree > ul.BCATM-term-list > li').each((_, item) => {
                // Find the toggle button 
                const $termRow = $(item).children('.BCATM-term-row');
                const $toggleBtn = $termRow.find('.BCATM-toggle-children');
                
                // Only process items that have the toggle button (meaning they have children)
                if ($toggleBtn.length && !$toggleBtn.hasClass('BCATM-toggle-placeholder')) {
                    const $childList = $(item).children('ul.BCATM-term-list');
                    
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
            this.elements.termSearch.off();
            this.elements.addNewBtn.off();
            this.elements.termsTree.off();
            this.elements.closeEditorBtn.off();

            // Destroy sortable
            $('.BCATM-terms-tree .BCATM-term-list').sortable('destroy');

            // Remove document event handlers
            $(document).off('submit', '#BCATM-term-edit-form');
            $(document).off('click', '.BCATM-cancel-edit');
            $(document).off('click', '.BCATM-delete-term');
            $(document).off('click', '#generate-description');
            $(document).off('change input', '#BCATM-term-edit-form input, #BCATM-term-edit-form textarea, #BCATM-term-edit-form select');

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
                if ($('#tmpl-BCATM-term-row').length === 0 || $('#tmpl-BCATM-term-form').length === 0) {
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
                window.BCATMCategoryEditor = new CategoryEditor();
                
                // Only initialize if creation was successful
                if (window.BCATMCategoryEditor) {
                    window.BCATMCategoryEditor.init();
                    
                    // Handle unsaved changes warning without using storage
                    $(window).on('beforeunload', function(e) {
                        if (window.BCATMCategoryEditor && 
                            window.BCATMCategoryEditor.state && 
                            window.BCATMCategoryEditor.state.hasUnsavedChanges) {
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