import pandas as pd


def find_duplicate_emp_ids(file_name):
    """
    Loads data, finds EMP IDs that appear more than once,
    and prints them along with their count.
    """
    try:
        # 1. Load the JSON file
        df = pd.read_json(file_name)
    except FileNotFoundError:
        print(f"Error: File '{file_name}' not found.")
        return

    # 2. Count the occurrences of each EMP ID
    id_counts = df['EMP ID'].value_counts()

    # 3. Filter the counts to keep only those greater than 1 (duplicates)
    duplicate_ids = id_counts[id_counts > 1]

    # 4. Check if any duplicates were found
    if duplicate_ids.empty:
        print("No EMP IDs were found with more than one entry in the data.")
        return

    print(f"--- EMP IDs with more than 1 entry ({len(duplicate_ids)} IDs found) ---")

    # 5. Output the result in a readable format
    # Convert the Series to a DataFrame for clean printing
    df_duplicates = duplicate_ids.reset_index()
    df_duplicates.columns = ['EMP ID', 'Count of Entries']

    print(df_duplicates.to_markdown(index=False))


# Execute the function using your file name
file_name = 'membercsvjson.json'
find_duplicate_emp_ids(file_name)