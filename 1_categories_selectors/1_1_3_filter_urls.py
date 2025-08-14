def my_function(base_url):

    nav_links = list(set(nav_links))

    print('number of links found (after duplicate removal): ' + str(len(nav_links)))

    for link in nav_links:
        print(link)

    # define keywords for non-product pages
    non_product_keywords = [
        'about', 'contact', 'faq', 'terms', 'policy', 'privacy', 'help', 
        'support', 'blog', 'news', 'login', 'register', 'account', 'careers',
        'wishlist', 'stores', 'story-show', 'returns', 'mailto', 'kids', 'gift',
        'footer', 'navigation', 'sustainability', 'cart', 'search', 'all', 'sale',
        'shipping', 'payment', 'sizing', 'guide', 'lookbook', 'press', 'media',
        'imprint', 'new', 'subscribe', 'homepage', 'customer', 'instagram', 'facebook',
        'tiktok', 'pinterest', 'youtube', 'linkedin', 'twitter', 'snapchat', 'whatsapp',
    ]

    # function to check if a URL is likely a non-product page
    def is_non_product_url(url):
        return any(keyword in url.lower() for keyword in non_product_keywords)

    # filter out non-product URLs
    filtered_links = [url for url in nav_links if not is_non_product_url(url)]

    # calculate removed links
    removed_links = [url for url in nav_links if is_non_product_url(url)]

    # print the number of removed links and the list of them
    print(f"number of links removed: {len(removed_links)}")
    print("\nremoved links:")
    print(removed_links)
    print('')
    print('number of links found (after filtering): ' + str(len(filtered_links)))

    print('filtered links: ' + str(filtered_links))

    # add trailing slash to base_url if not present
    if not base_url.endswith('/'):
        base_url_now = base_url + '/'

    # remove links that are just the base URL or only contain special characters
    filtered_links_new = []
    for link in filtered_links:
        # remove base URL from link
        relative_path = link.replace(base_url_now, '')
        
        # check if there's anything meaningful left after removing base URL
        if relative_path and not all(not c.isalnum() for c in relative_path):
            filtered_links_new.append(link)

    # update filtered_links
    filtered_links = filtered_links_new

    print(f"\nremoved {len(filtered_links_new) - len(filtered_links)} links that were just the base URL or special characters")
    print(f"remaining links: {len(filtered_links)}")

    # count how many links contain 'collections'
    collections_count = sum('collections' in link.lower() for link in filtered_links)

    # if more than 3 links have 'collections', remove links with 'products'
    if collections_count > 3:
        filtered_links = [link for link in filtered_links if 'products' not in link.lower()]
        print(f"\nremoved links containing 'products' since {collections_count} links contained 'collections'")
    else:
        print("\nkept all links since only {collections_count} links contained 'collections'")


    return filtered_links