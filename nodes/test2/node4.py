import time

def input_sleep(valueA):
    """process input and add a sleep"""
    print(f"processing input: {valueA}")
    time.sleep(1)  # sleep for 1 second
    result = valueA * 2
    print(f"result after sleep: {result}")
    return result

if __name__ == "__main__":
    # for testing
    result = input_sleep(10)
    print(f"final result: {result}")
