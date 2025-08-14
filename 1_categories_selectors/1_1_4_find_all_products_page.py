def my_function(nav_links_save):

    # find urls containing keywords that suggest "all products" pages
    all_products_keywords = ['all', 'products', 'collection', 'shop']
    product_pages = []

    for url in nav_links_save:
        # remove base url and convert to lowercase for case-insensitive matching
        path = url.split('/', 3)[-1].lower() if len(url.split('/', 3)) > 3 else ''
        
        # check if path contains any of the keywords, ensuring 'all' is a standalone word
        contains_keyword = False
        for keyword in all_products_keywords:
            if keyword == 'all':
                # Split path into parts and check if 'all' exists as a standalone word
                path_parts = path.replace('-', ' ').replace('_', ' ').split('/')
                for part in path_parts:
                    words = part.split()
                    if 'all' in words:
                        contains_keyword = True
                        break
            else:
                if keyword in path:
                    contains_keyword = True
                    
        if contains_keyword:
            product_pages.append(url)

    print("potential all products pages found:")
    for page in product_pages:
        print(page)

    # if multiple pages found, prioritize the most likely "all products" page
    if product_pages:
        # score each url based on keyword matches and url structure
        url_scores = []
        for url in product_pages:
            path = url.split('/', 3)[-1].lower() if len(url.split('/', 3)) > 3 else ''
            score = 0
            
            # higher score for paths with multiple keywords
            for keyword in all_products_keywords:
                if keyword == 'all':
                    # Check for standalone 'all'
                    path_parts = path.replace('-', ' ').replace('_', ' ').split('/')
                    for part in path_parts:
                        words = part.split()
                        if 'all' in words:
                            score += 1
                            break
                else:
                    if keyword in path:
                        score += 1
                    
            # scoring based on path structure
            path_parts = path.split('/')
            
            # check for collections/all pattern
            if len(path_parts) >= 2:
                if 'collections' in path_parts and 'all' in path_parts[path_parts.index('collections')+1:]:
                    score += 5  # highest priority for collections/all pattern
                    
            # secondary scoring for other common patterns
            if '/products' in path:
                score += 2
            if path.endswith('/all'):
                score += 1
                
            url_scores.append((url, score))
        
        # sort urls by score in descending order
        url_scores.sort(key=lambda x: x[1], reverse=True)
        
        print("\nmost likely all products page:")
        print(url_scores[0][0])
    else:
        # if no "all" pages found, look for sale urls
        sale_keywords = ['sale', 'discount', 'outlet', 'clearance']
        sale_pages = []
        
        for url in nav_links_save:
            path = url.split('/', 3)[-1].lower() if len(url.split('/', 3)) > 3 else ''
            if any(keyword in path for keyword in sale_keywords):
                sale_pages.append(url)
        
        if sale_pages:
            print("\nno all products pages found. using sale page instead:")
            print(sale_pages[0])
        else:
            # if no sale pages found, look for gender-specific home pages
            gender_keywords = ['men', 'mens', "men's", 'women', 'womens', "women's", 'male', 'female']
            gender_pages = []
            
            for url in nav_links_save:
                path = url.split('/', 3)[-1].lower() if len(url.split('/', 3)) > 3 else ''
                if any(keyword in path for keyword in gender_keywords):
                    gender_pages.append(url)
                    
            if gender_pages:
                print("\nno all products or sale pages found. using gender home page instead:")
                print(gender_pages[0])
            else:
                print("no all products, sale, or gender pages found")

    # get the final url based on the logic above
    if url_scores:
        max_product_page_url = url_scores[0][0]
    elif sale_pages:
        max_product_page_url = sale_pages[0]
    elif gender_pages:
        max_product_page_url = gender_pages[0]
    else:
        max_product_page_url = filtered_links[0]

    export_to_json("1.1", )



    return argument1