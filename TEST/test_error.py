def test_function():
    # this is line 2
    x = 10
    # this is line 4
    y = 20
    # this is line 6 - this will cause an error
    z = x / 0  # division by zero error on line 7
    return z

# call the function to trigger the error
if __name__ == "__main__":
    test_function()
