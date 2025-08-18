def my_function(nav_links):

    # Loop through all URLs and append base URL if needed
    for i in range(len(nav_links)):
        if not nav_links[i].startswith("https://"):
            nav_links[i] = base_url.rstrip("/") + "/" + nav_links[i].lstrip("/")

    for link in nav_links:
        print(link)

    nav_links_save = nav_links

    return nav_links