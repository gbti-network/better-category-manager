/**
 * BCM Category Editor JavaScript
 */
(function($) {
    'use strict';

    // Bind auth and sponsor events immediately
    $(document).on('BCM:auth-required BCM:sponsor-invalid', function() {
        BCM.debug.log('Auth/Sponsor validation required, showing notification');
        
        // Create and show the admin notice
        const notice = $('<div class="notice notice-warning is-dismissible"><p>' + 
            'Updates for <b>Better Category Manager</b> are currently disabled. <br> Please <a href="' + gbtiAdmin.adminUrl + 'admin.php?page=BCM-settings">visit the settings page</a> ' +
            'to connect to the GBTI Network.' +
            '</p></div>');
            
        // Insert the notice at the top of the wrap
        $('.wrap').first().prepend(notice);
        
        // Initialize WordPress dismissible notices
        if (typeof wp !== 'undefined' && wp.notices) {
            wp.notices.makeDismissible(notice);
        }

        setTimeout(() => {
            window.gbtiCategoryEditor.hideLoadingScreen();
        }, 500);
    });

    $(document).on('BCM:sponsor-valid', function() {
        BCM.debug.group('Handling sponsor validation');
        
        if (window.gbtiCategoryEditor.state.contentLoaded) {
            window.gbtiCategoryEditor.hideLoadingScreen();
        } else {
            window.gbtiCategoryEditor.loadTerms();
        }
        
        BCM.debug.groupEnd();
    });

    class CategoryEditor {
        constructor() {
            this.initializeElements();
            this.initializeState();
            this.setupLoadingScreen(); 
        }

        /**
         * Initialize DOM element references
         */
        initializeElements() {
            this.elements = {
                wrap: $('.wrap'),
                categorySelect: $('#category-select'),
                termSearch: $('#term-search'),
                termsTree: $('#category-terms-tree'),
                termEditor: $('.BCM-term-editor'),
                addNewBtn: $('#add-new-term'),
                loadingOverlay: $('.BCM-loading-overlay'),
                editorContent: $('.BCM-term-editor-content'),
                closeEditorBtn: $('.BCM-close-editor'),
                loadingScreen: null,
                container: $('.BCM-terms-tree'),
                notificationContainer: $('#BCM-notification-container')
            };

            // Create notification container if it doesn't exist
            if (!this.elements.notificationContainer.length) {
                console.log('Creating notification container during initialization');
                $('.wrap').prepend('<div id="BCM-notification-container" class="BCM-notification-container"></div>');
                this.elements.notificationContainer = $('#BCM-notification-container');
            }

            this.templates = {
                termRow: wp.template('BCM-term-row'),
                termForm: wp.template('BCM-term-form')
            };
        }

        /**
         * Initialize state
         */
        initializeState() {
            this.state = {
                currentCategory: this.elements.categorySelect.val(),
                currentTermId: null,
                isLoading: false,
                expandedTerms: new Set(),
                isDragging: false,
                hasUnsavedChanges: false,
                contentLoaded: false, // Track if content has been loaded
                initialLoadComplete: false, // Track if initial load is complete
                isHierarchical: false // Track if the current category is hierarchical
            };
        }

        /**
         * Initialize the editor
         */
        init() {
            if (!this.templates.termRow || !this.templates.termForm) {
                console.error('Required templates are missing');
                return;
            }

            // Initialize state properties
            this.state.isHierarchical = false;
            
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
                        if (confirm(gbtiAdmin.i18n.unsaved_changes || 'There are unsaved changes. Do you want to discard them?')) {
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
                    if (confirm(gbtiAdmin.i18n.confirm_delete)) {
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
                $('.BCM-collapse-all').on('click', () => {
                    this.collapseAllFirstLevel();
                });

                $('.BCM-expand-all').on('click', () => {
                    this.expandAllFirstLevel();
                });
            } catch (error) {
                console.error('Error binding events:', error);
            }
        }

        /**
         * Setup loading screen
         */
        setupLoadingScreen() {
            BCM.debug.group('Setting up loading screen');
            
            // Create and insert loading screen
            const loadingScreen = `
                <div id="BCM-loading-screen" style="
                    position: fixed;
                    top: 0;
                    left: 160px;
                    width: calc(100% - 160px);
                    height: 100%;
                    background: #fff;
                    z-index: 100000;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    transition: opacity 0.3s ease-out;">
                    <div class="BCM-loader"></div>
                </div>
            `;
            
            // Add loading screen to body and store reference
            $('body').append(loadingScreen);
            this.elements.loadingScreen = $('#BCM-loading-screen');
            
            BCM.debug.log('Loading screen added to DOM');
            BCM.debug.groupEnd();
        }

        /**
         * Handle successful sponsor validation
         */
        onSponsorValidated() {
            BCM.debug.group('Handling sponsor validation');
            
            if (this.state.contentLoaded) {
                this.hideLoadingScreen();
            } else {
                this.loadTerms();
            }
            
            BCM.debug.groupEnd();
        }

        /**
         * Hide loading screen
         */
        hideLoadingScreen() {
            BCM.debug.group('Hiding loading screen');
            
            if (!this.elements.loadingScreen) {
                BCM.debug.warn('Loading screen element not found');
                return;
            }

            this.state.isLoading = false;
            this.elements.loadingScreen.css('opacity', '0');
            
            setTimeout(() => {
                this.elements.loadingScreen.hide();
                BCM.debug.log('Loading screen hidden');
                BCM.debug.groupEnd();
            }, 300);
        }

        /**
         * Show loading screen
         */
        showLoadingScreen() {
            BCM.debug.group('Showing loading screen');
            
            if (!this.elements.loadingScreen) {
                BCM.debug.warn('Loading screen not found, setting up new one');
                this.setupLoadingScreen();
            }
            
            this.state.isLoading = true;
            this.elements.loadingScreen.show().css('opacity', '1');
            
            BCM.debug.log('Loading screen shown');
            BCM.debug.groupEnd();
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
            
            BCM.debug.group('Loading terms for category: ' + category);
            this.showLoadingScreen();
            
            $.ajax({
                url: gbtiAdmin.ajax_url,
                type: 'POST',
                dataType: 'json',
                data: {
                    action: 'BCM_get_terms',
                    nonce: gbtiAdmin.nonce,
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
                        this.hideLoadingScreen();
                    } else {
                        console.error('Error loading terms', response.data);
                        if (!suppressNotification) {
                            this.showError(response.data.message || 'Error loading terms');
                        }
                        this.hideLoadingScreen(); // Always hide on error
                    }
                },
                error: () => {
                    console.error('Failed to load terms');
                    if (!suppressNotification) {
                        this.showError('Failed to load terms. Please try again.');
                    }
                    this.hideLoadingScreen(); // Always hide on error
                }
                // Initial load will be hidden by BCM:sponsor-valid event
            });
            
            BCM.debug.groupEnd();
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
                    `<p class="BCM-no-terms">${gbtiAdmin.i18n.no_terms}</p>`
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
                this.initializeDragAndDrop();
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
        initializeDragAndDrop() {
            // Skip if category is not hierarchical
            if (!this.state.isHierarchical) {
                BCM.debug.log('Skipping drag and drop initialization for non-hierarchical category');
                return;
            }
            
            BCM.debug.log('Initializing drag and drop');
            
            $('.BCM-terms-tree .BCM-term-list').sortable({
                handle: '.BCM-term-handle',
                items: '> li',
                placeholder: 'BCM-term-placeholder',
                tolerance: 'pointer',
                cursor: 'move',
                connectWith: '.BCM-term-list',
                delay: 150,
                helper: 'clone',
                grid: [20, 1],

                start: (e, ui) => {
                    console.log('Drag Start');
                    const $item = ui.item;
                    const $itemRow = $item.find('.BCM-term-row');
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
                    const draggedItemId = ui.item.find('.BCM-term-row').data('id');

                    // Clear previous visual indicators
                    $('.BCM-term-row').removeClass('potential-parent hover-target');
                    $('.temp-drop-container').removeClass('active');
                    $('.nesting-helper').remove();

                    // Find potential parent based on mouse position
                    const $potentialParents = $('.BCM-term-row').filter(function() {
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
                        let $dropContainer = closestParent.next('.BCM-term-list');
                        if (!$dropContainer.length) {
                            $dropContainer = $('<ul class="BCM-term-list temp-drop-container"></ul>');
                            closestParent.after($dropContainer);
                        }
                        $dropContainer.addClass('active');

                        // Add helper text
                        if (!closestParent.find('.nesting-helper').length) {
                            closestParent.append(
                                '<span class="nesting-helper">Release to nest under ' +
                                closestParent.find('.BCM-term-name').text() + '</span>'
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
                        const $parent = $(`.BCM-term-row[data-id="${newParentId}"]`);

                        // Create or get child list
                        let $childList = $parent.next('.BCM-term-list:not(.temp-drop-container)');
                        if (!$childList.length) {
                            $childList = $('<ul class="BCM-term-list"></ul>');
                            $parent.after($childList);
                        }

                        // Move item to child list
                        $item.appendTo($childList);

                        // Update toggle button
                        this.updateToggleButton($parent);
                    } else {
                        // If not nesting, parent is determined by the containing list
                        const $parentRow = $item.parent('.BCM-term-list').prev('.BCM-term-row');
                        newParentId = $parentRow.length ? $parentRow.data('id') : 0;
                    }

                    // Cleanup
                    $('.BCM-term-row').removeClass('potential-parent hover-target is-dragging');
                    $('.temp-drop-container').remove();
                    $('.nesting-helper').remove();

                    // Update hierarchy
                    this.updateTermHierarchy($item, newParentId);

                    // Reset state
                    this.state.mouseTracking = { startX: 0, currentX: 0 };
                    this.state.potentialParentId = null;
                }
            }).disableSelection();
        }

        /**
         * Helper method to update toggle button
         */
        updateToggleButton($parent) {
            const $existing = $parent.find('.BCM-toggle-children');
            const hasChildren = $parent.next('.BCM-term-list').children().length > 0;

            if (!hasChildren) {
                // If no children, remove the toggle button and replace with placeholder
                if ($existing.length) {
                    $existing.replaceWith('<span class="BCM-toggle-placeholder"></span>');
                }
            } else {
                // If has children, ensure toggle button exists and is in correct state
                if (!$existing.length) {
                    $parent.find('.BCM-toggle-placeholder').replaceWith(`
                <button type="button" class="BCM-toggle-children expanded" title="Toggle children visibility">
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
            console.log('Term ID:', $item.find('.BCM-term-row').data('id'));
            console.log('New parent ID:', newParentId);
            
            this.setLoading(true);

            $.ajax({
                url: gbtiAdmin.ajax_url,
                method: 'POST',
                data: {
                    action: 'BCM_update_term_hierarchy',
                    term_id: $item.find('.BCM-term-row').data('id'),
                    parent_id: newParentId,
                    category: this.state.currentCategory,
                    nonce: gbtiAdmin.nonce
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
                                gbtiAdmin.i18n.term_updated || 'Term updated successfully.', 
                                'success'
                            );
                        }
                        
                        // Load terms without notification
                        this.loadTerms(true);
                    }
                },
                error: (xhr, status, error) => {
                    console.error('Ajax error:', {xhr, status, error});
                    this.showError(gbtiAdmin.i18n.hierarchy_update_error);
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
                !confirm(gbtiAdmin.i18n.unsaved_changes || 'There are unsaved changes. Do you want to discard them?')) {
                return;
            }

            this.setLoading(true);
            this.state.currentTermId = termId;

            $.ajax({
                url: gbtiAdmin.ajax_url,
                method: 'POST',
                data: {
                    action: 'BCM_get_term_data',
                    term_id: termId,
                    category: this.state.currentCategory,
                    nonce: gbtiAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        // Log the response to verify data
                        console.log('Term data received:', response.data);
                        const settings = window.gbtiAdmin?.settings || {};
                        // Format the data for the form template
                        const formData = {
                            id: response.data.term.id,
                            name: response.data.term.name,
                            slug: response.data.term.slug,
                            description: response.data.term.description,
                            category: response.data.term.category,
                            parent: response.data.term.parent,
                            showParent: response.data.category.hierarchical,
                            parentDropdown: response.data.parent_terms,
                            canDelete: true ,
                            default_prompt: settings.default_prompt || ''
                        };

                        this.showTermForm(formData);
                    } else {
                        this.showError(response.data.message);
                    }
                },
                error: () => {
                    this.showError(gbtiAdmin.i18n.error_loading || 'Failed to load term data');
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
            formData.append('nonce', gbtiAdmin.nonce);

            this.setLoading(true);

            $.ajax({
                url: gbtiAdmin.ajax_url,
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
                                gbtiAdmin.i18n.term_updated || 'Term updated successfully.', 
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
                        gbtiAdmin.i18n.save_error || 'Failed to save the term.', 
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
                    url: gbtiAdmin.ajax_url,
                    method: 'POST',
                    data: {
                        action: 'BCM_get_parent_terms',
                        category: this.state.currentCategory,
                        nonce: gbtiAdmin.nonce
                    },
                    success: (response) => {
                        if (response.success) {
                            const settings = window.gbtiAdmin?.settings || {};
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
                                default_prompt: settings.default_prompt || ''
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
                const settings = window.gbtiAdmin?.settings || {};
                if (settings.default_prompt) {
                    formData.default_prompt = settings.default_prompt.replace(
                        /\[TERM_NAME\]/g,
                        formData.name || ''
                    );
                }
            }

            this.elements.termEditor.removeClass('hidden');
            this.elements.termEditor.find('.BCM-term-editor-header h2')
                .text(formData.isNewTerm ? gbtiAdmin.i18n.create_term : gbtiAdmin.i18n.edit_term);

            this.elements.editorContent.html(this.templates.termForm(formData));

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
                url: gbtiAdmin.ajax_url,
                method: 'POST',
                data: {
                    action: 'BCM_delete_term',
                    term_id: this.state.currentTermId,
                    category: this.state.currentCategory,
                    nonce: gbtiAdmin.nonce
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
                    this.showError(gbtiAdmin.i18n.delete_error);
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
            if (!gbtiAdmin.has_api_key) {
                this.showError(gbtiAdmin.i18n.api_key_missing);
                return;
            }

            const button = $('#generate-description');
            const spinner = button.find('.spinner');
            const prompt = $('#openai-prompt').val();
            const termName = $('#term-name').val();

            button.prop('disabled', true);
            spinner.addClass('is-active');

            $.ajax({
                url: gbtiAdmin.ajax_url,
                method: 'POST',
                data: {
                    action: 'BCM_generate_description',
                    prompt: prompt,
                    term_name: termName,
                    nonce: gbtiAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        $('#term-description').val(response.data.description);
                        this.state.hasUnsavedChanges = true;
                    } else {
                        this.showError(response.data.message);}
                },
                error: () => {
                    this.showError(gbtiAdmin.i18n.generate_error);
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
            console.log('Showing notification:', message, type);
            
            // Make sure container exists and is accessible
            if (!$('#BCM-notification-container').length) {
                $('.wrap').prepend('<div id="BCM-notification-container" class="BCM-notification-container"></div>');
                this.elements.notificationContainer = $('#BCM-notification-container');
            }
            
            // Create notification element
            const notificationId = 'notification-' + Date.now();
            const notificationClass = 'BCM-notification BCM-notification-' + type;
            
            const notificationHtml = `
                <div id="${notificationId}" class="${notificationClass}">
                    <div class="BCM-notification-content">${message}</div>
                    <div class="BCM-notification-close">&times;</div>
                </div>
            `;
            
            // Add to container
            $('#BCM-notification-container').append(notificationHtml);
            const $notification = $(`#${notificationId}`);
            
            // Setup close button
            $notification.find('.BCM-notification-close').on('click', () => {
                this.dismissNotification($notification);
            });
            
            // Auto-dismiss after duration (if specified)
            if (duration > 0) {
                setTimeout(() => {
                    this.dismissNotification($notification);
                }, duration);
            }
            
            return $notification;
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
            console.log('Error notification:', message);
            this.showNotification(message, 'error');
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
            $('.BCM-collapse-all').hide();
            $('.BCM-expand-all').show();
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
            $('.BCM-collapse-all').show();
            $('.BCM-expand-all').hide();
        }

        /**
         * Utility Methods
         */
        setLoading(loading) {
            this.state.isLoading = loading;
            this.elements.loadingOverlay.toggleClass('hidden', !loading);

            if (loading) {
                $('button').prop('disabled', true);
            } else {
                $('button').prop('disabled', false);
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
    $(document).ready(() => {
        // Store instance for potential external access
        window.gbtiCategoryEditor = new CategoryEditor();

        // Handle beforeunload
        $(window).on('beforeunload', function(e) {
            if (window.gbtiCategoryEditor &&
                window.gbtiCategoryEditor.state &&
                window.gbtiCategoryEditor.state.hasUnsavedChanges) {
                e.preventDefault();
                return '';
            }
        });
    });

    // Wait for auth system to validate before initializing
    $(document).on('BCM:sponsor-valid', function() {
        window.gbtiCategoryEditor.init();
    });
})(jQuery);