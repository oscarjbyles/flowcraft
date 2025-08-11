def my_function(random_number):

    import random
    import string

    # generate an array of length 6 of random strings
    random_strings = [''.join(random.choices(string.ascii_letters + string.digits, k=10)) for _ in range(6)]
    for string in random_strings:
        import time
        time.sleep(1)
        print(string)

    argument1 = 1

    # put your script here 

    return argument1, random_strings