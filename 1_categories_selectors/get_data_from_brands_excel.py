def get_data_from_brands_excel():

    import pandas as pd
    import warnings
    warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

    # specify the excel file name (assumes it's in the same folder as this script)
    file_name = "./_brands.xlsx"
    sheet_name = "all"

    # read the excel file in read-only mode
    try:
        df = pd.read_excel(file_name, sheet_name=sheet_name, engine="openpyxl", dtype=str)
    except FileNotFoundError:
        print("error: the file 'brands.xlsx' was not found in the current folder.")
        exit()
    except Exception as e:
        print(f"error: {e}")
        exit()

    # check if dataframe has at least two columns
    if df.shape[1] < 2:
        print("error: the spreadsheet must have at least two columns.")
        exit()

    warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

    # ask the user to specify the second column's header
    column_name = 'url'

    # check if the specified column exists
    if column_name not in df.columns:
        print("error: the specified column header was not found in the spreadsheet.")
        exit()

    # get user input for first column value
    user_input = input("enter a value from the first column: ")

    # search for the value in the first column
    if user_input in df.iloc[:, 0].values:
        result = df.loc[df.iloc[:, 0] == user_input, column_name].values[0]
        url = result
        print(f"corresponding {column_name}: {result}")
    else:
        print("error: the entered value was not found in the first column.")

    return url

    column_name = 'test_mode'

    # check if the specified column exists
    if column_name not in df.columns:
        print("error: the specified column header was not found in the spreadsheet.")
        exit()

    # search for the value in the first column
    if user_input in df.iloc[:, 0].values:
        result = df.loc[df.iloc[:, 0] == user_input, column_name].values[0]
        test_mode = result
        
    else:
        print("error: the entered value was not found in the first column.")

    if not test_mode:
        test_mode = 'test'
        print(f"test_mode was empty, set to: {test_mode}")
    else:
        print(f"test_mode: {test_mode}")

    print(f"corresponding {column_name}: {result}")

    # ask the user to specify the second column's header
    column_name = 'overflow_type'

    # check if the specified column exists
    if column_name not in df.columns:
        print("error: the specified column header was not found in the spreadsheet.")
        exit()

    # search for the value in the first column
    if user_input in df.iloc[:, 0].values:
        result = df.loc[df.iloc[:, 0] == user_input, column_name].values[0]
        overflow_type = result
        print(f"corresponding {column_name}: {result}")
    else:
        print("error: the entered value was not found in the first column.")