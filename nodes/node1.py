def calculate_and_print_result(variableC, num45):

    num1 = input("Enter number: ")
    num2 = input("Enter number: ")

    print(num1)
    print(num2)

    num1 = float(num1)
    num2 = float(num2)

    result = variableC + num1 + num2 + num45

    # printing the result
    print(f"calculation result: {result}")

    # creating an array of strings
    strings_array = ["apple", "banana", "cherry"]

    # printing the array of strings
    print("fruits:")
    for string in strings_array:
        print(f"  - {string}")

    import time

    time.sleep(3)

    return result
