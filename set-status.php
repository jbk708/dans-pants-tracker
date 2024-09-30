<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $status = $_POST['status'];
    $data = ["status" => $status];

    if (file_put_contents('status.json', json_encode($data)) === false) {
        echo "Error: Could not write to status.json";
    } else {
        echo "Status updated!";
    }
} else {
    echo "Invalid request method. Use POST.";
}
?>

