def my_function():

    import os
    import json
    import shutil

    # create temp_output directory if it doesn't exist
    if not os.path.exists('temp_output'):
        os.makedirs('temp_output')
        print("created temp_output directory")

    # specify the filenames to be deleted
    files_to_delete = ["category_urls.csv", "data_selectors.json"]

    # get the current working directory
    current_directory = os.getcwd()

    # iterate over the files and delete them if they exist
    for file in files_to_delete:
        file_path = os.path.join(current_directory, file)
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"deleted: {file}")
        else:
            print(f"file not found: {file}")

    # clean up and recreate temp_output directory
    if os.path.exists('temp_output'):
        shutil.rmtree('temp_output')
    os.makedirs('temp_output')
    print("recreated temp_output directory")