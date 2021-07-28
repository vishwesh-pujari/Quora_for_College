document.querySelector("#college").addEventListener("input", function (event) {
    if ((event.data >= 'a' && event.data <= 'z') || event.data == ' ' || event.inputType === "deleteContentBackward") {

    } else {
        this.value = "";
        alert("DON'T write short forms, only make use of small letters and spaces");
    }
});
