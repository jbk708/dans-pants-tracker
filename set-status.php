<?php
if (isset($_GET['status'])) {
    $status = $_GET['status'];
    $data = ["status" => $status];
    file_put_contents('status.json', json_encode($data));
    echo "Status updated!";
} else {
    echo "No status provided.";
}
?>

