/**
 * Menu highlight script for Advanced Category Manager
 * Ensures proper menu highlighting when viewing the category manager
 */
jQuery(document).ready(function($) {
    // First try - find directly by text content
    var categoryFound = false;
    
    // Get all submenu links in the Posts menu
    $("#menu-posts .wp-submenu li a").each(function() {
        // Check if the text contains "Categories"
        if ($(this).text().trim() === "Categories") {
            // Add current class to the parent li
            $(this).parent().addClass("current");
            categoryFound = true;
        }
    });
    
    // Second try - find by href if not found by text
    if (!categoryFound) {
        $("#menu-posts .wp-submenu li a[href*=\"edit-tags.php?taxonomy=category\"]").parent().addClass("current");
    }
    
    // Force the Posts menu to be highlighted
    $("#menu-posts").removeClass("wp-not-current-submenu").addClass("wp-has-current-submenu wp-menu-open");
    $("#menu-posts > a").removeClass("wp-not-current-submenu").addClass("wp-has-current-submenu");
});
