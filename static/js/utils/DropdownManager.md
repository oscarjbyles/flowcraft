# DropdownManager - Centralized Dropdown System

## Overview

The `DropdownManager` is a centralized system that consolidates all dropdown functionality across the FlowCraft application. It eliminates code duplication and provides a consistent, feature-rich dropdown experience.

## Features

- **Unified API**: Single interface for all dropdown operations
- **Keyboard Navigation**: Arrow keys, Enter, Escape support
- **Search/Filter**: Built-in search functionality
- **Custom Rendering**: Flexible item rendering options
- **Event Handling**: Comprehensive event callbacks
- **Global Management**: Automatic closing of other dropdowns
- **Backward Compatibility**: Legacy methods still work

## HTML Structure

All dropdowns follow this consistent HTML structure:

```html
<div class="dropdown_container" id="unique_container_id">
    <input type="text" id="unique_input_id" class="form_input dropdown_input" placeholder="select item..." readonly>
    <span class="dropdown_arrow material-icons">arrow_drop_down</span>
    <div class="dropdown_menu" id="unique_menu_id">
        <!-- items will be populated here -->
    </div>
</div>
```

## Basic Usage

### Creating a Simple Dropdown

```javascript
// create dropdown instance
const dropdown = window.DropdownManager.create({
    containerId: 'my_dropdown_container',
    inputId: 'my_dropdown_input',
    menuId: 'my_dropdown_menu',
    options: {
        placeholder: 'select an option...',
        onSelect: (selectedItem, dropdown) => {
            console.log('selected:', selectedItem);
        }
    }
});

// set items
dropdown.setItems([
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' }
]);
```

### Searchable Dropdown

```javascript
const searchableDropdown = window.DropdownManager.create({
    containerId: 'searchable_container',
    inputId: 'searchable_input',
    menuId: 'searchable_menu',
    options: {
        searchable: true,
        placeholder: 'search and select...',
        onSelect: (selectedItem, dropdown) => {
            console.log('selected:', selectedItem);
        }
    }
});
```

### Custom Item Rendering

```javascript
const customDropdown = window.DropdownManager.create({
    containerId: 'custom_container',
    inputId: 'custom_input',
    menuId: 'custom_menu',
    options: {
        renderItem: (item) => {
            return `
                <div class="dropdown_item" data-value="${item.value}" data-label="${item.label}">
                    <div class="dropdown_item_content">
                        <div class="dropdown_item_name">${item.label}</div>
                        <div class="dropdown_item_path">${item.path}</div>
                        <button class="dropdown_delete_btn" data-value="${item.value}">
                            <span class="material-icons">delete</span>
                        </button>
                    </div>
                </div>
            `;
        },
        onSelect: (selectedItem, dropdown) => {
            console.log('selected:', selectedItem);
        }
    }
});
```

## Configuration Options

### DropdownInstance Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `searchable` | boolean | `false` | Enable search/filter functionality |
| `readonly` | boolean | `true` | Make input readonly |
| `placeholder` | string | `''` | Input placeholder text |
| `onSelect` | function | `null` | Callback when item is selected |
| `onOpen` | function | `null` | Callback when dropdown opens |
| `onClose` | function | `null` | Callback when dropdown closes |
| `renderItem` | function | `null` | Custom item rendering function |
| `filterItems` | function | `null` | Custom filtering function |

### Item Data Structure

Items should have this structure:

```javascript
{
    value: 'unique_value',      // required: unique identifier
    label: 'Display Name',      // required: display text
    path: '/optional/path',     // optional: additional path info
    name: 'Alternative Name',   // optional: alternative display name
    // ... any additional properties
}
```

## API Reference

### DropdownManager Methods

#### `create(config)`
Creates a new dropdown instance.

#### `get(containerId)`
Gets an existing dropdown instance.

#### `closeAllDropdowns(targetElement)`
Closes all dropdowns except the one containing the target element.

#### `close(containerId)`
Closes a specific dropdown.

#### `destroy(containerId)`
Destroys a dropdown instance.

#### `destroyAll()`
Destroys all dropdown instances.

### DropdownInstance Methods

#### `open()`
Opens the dropdown.

#### `close()`
Closes the dropdown.

#### `toggle()`
Toggles the dropdown open/closed state.

#### `setItems(items)`
Sets the items and renders the menu.

#### `filterItems(searchTerm)`
Filters items based on search term.

#### `getValue()`
Gets the selected value.

#### `getLabel()`
Gets the selected label.

#### `setValue(value, label)`
Sets the value programmatically.

#### `clear()`
Clears the selection.

#### `showLoading(message)`
Shows loading state.

#### `showError(message)`
Shows error state.

#### `destroy()`
Destroys the instance.

## Migration Guide

### From Legacy Dropdowns

#### Old Way (Legacy)
```javascript
// manual event handling
const input = document.getElementById('my_input');
const dropdown = document.getElementById('my_dropdown');
const container = input.closest('.dropdown_container');

input.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
});

document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

// manual item rendering
dropdown.innerHTML = items.map(item => `
    <div class="dropdown_item" data-value="${item.value}">
        ${item.label}
    </div>
`).join('');

// manual selection handling
dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown_item');
    if (item) {
        input.value = item.dataset.label;
        input.dataset.value = item.dataset.value;
        dropdown.classList.remove('show');
    }
});
```

#### New Way (Centralized)
```javascript
// create dropdown with all functionality
const dropdown = window.DropdownManager.create({
    containerId: 'my_container',
    inputId: 'my_input',
    menuId: 'my_dropdown',
    options: {
        onSelect: (selectedItem, dropdown) => {
            console.log('selected:', selectedItem);
        }
    }
});

// set items
dropdown.setItems([
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' }
]);
```

### Backward Compatibility

Legacy methods are still available through `window.SidebarDropdowns`:

```javascript
// legacy methods still work
window.SidebarDropdowns.open(menuElement);
window.SidebarDropdowns.close(menuElement);
window.SidebarDropdowns.toggle(menuElement);
window.SidebarDropdowns.isOpen(menuElement);
```

## Examples

### Python File Dropdown
```javascript
const pythonFileDropdown = window.DropdownManager.create({
    containerId: 'python_file_container',
    inputId: 'python_file',
    menuId: 'python_file_dropdown',
    options: {
        searchable: true,
        readonly: true,
        placeholder: 'select python file...',
        onSelect: (selectedItem, dropdown) => {
            selectPythonFile(selectedItem.value, selectedItem.label);
        },
        onOpen: (dropdown) => {
            loadPythonFiles();
        },
        renderItem: (item) => {
            const displayPath = item.path.startsWith('nodes/') ? 
                item.path.substring(6) : item.path;
            return `
                <div class="dropdown_item" data-value="${item.path}" data-label="${displayPath}">
                    ${displayPath}
                </div>
            `;
        }
    }
});
```

### Flowchart Selector Dropdown
```javascript
const flowchartDropdown = window.DropdownManager.create({
    containerId: 'flowchart_container',
    inputId: 'flowchart_selector',
    menuId: 'flowchart_dropdown',
    options: {
        placeholder: 'select flowchart...',
        onSelect: (selectedItem, dropdown) => {
            selectFlowchart(selectedItem.value, selectedItem.label);
        },
        renderItem: (item) => {
            return `
                <div class="dropdown_item" data-value="${item.filename}" data-label="${item.name}">
                    <div class="dropdown_item_content">
                        <div class="dropdown_item_name">${item.name}</div>
                        <div class="dropdown_item_path">${item.filename}</div>
                    </div>
                    <button class="dropdown_delete_btn" data-filename="${item.filename}">
                        <span class="material-icons">delete</span>
                    </button>
                </div>
            `;
        }
    }
});
```

## CSS Classes

The system uses these CSS classes:

- `.dropdown_container` - Main container
- `.dropdown_input` - Input field
- `.dropdown_arrow` - Arrow icon
- `.dropdown_menu` - Menu container
- `.dropdown_item` - Individual item
- `.dropdown_item_content` - Item content wrapper
- `.dropdown_item_name` - Item name
- `.dropdown_item_path` - Item path
- `.dropdown_loading` - Loading state
- `.dropdown_no_results` - No results state
- `.dropdown_delete_btn` - Delete button
- `.show` - Shows dropdown menu
- `.selected` - Selected item (keyboard navigation)

## Best Practices

1. **Unique IDs**: Always use unique IDs for container, input, and menu elements
2. **Error Handling**: Always check if dropdown creation was successful
3. **Cleanup**: Destroy dropdowns when components are unmounted
4. **Accessibility**: Use semantic HTML and proper ARIA attributes
5. **Performance**: Avoid creating unnecessary dropdown instances
6. **Consistency**: Use the same patterns across all dropdowns

## Troubleshooting

### Common Issues

1. **Dropdown not opening**: Check if all required elements exist
2. **Items not rendering**: Verify item data structure
3. **Events not firing**: Ensure callbacks are properly defined
4. **Styling issues**: Check CSS class names and specificity

### Debug Mode

Enable debug logging:

```javascript
// add this before creating dropdowns
window.DropdownManager.debug = true;
```

This will log detailed information about dropdown operations to the console.
