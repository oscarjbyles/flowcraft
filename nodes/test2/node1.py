def square_input(value):
    """square the input value"""
    result = value ** 2
    print(f"input: {value}, squared: {result}")
    return result

if __name__ == "__main__":
    # for testing
    result = square_input(5)
    print(f"result: {result}")
