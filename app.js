require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");

// passport
const session = require("express-session"); // for session cookies
const passport = require("passport"); // for dealing with authentication
const passportLocalMongoose = require("passport-local-mongoose");

const app = express();
app.use(express.urlencoded({extended: true}));
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(session({ // for express-session
    secret: process.env.SECRET, // SECRET is written in .env file
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb+srv://vishi:" + process.env.DATABASE_USER_PASSWORD + "@cluster0.xstnp.mongodb.net/quoraDB?retryWrites=true&w=majority", {useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false});

const userSchema = new mongoose.Schema({
    username: String, // email id of user
    name: String,
    password: String,
    college: String,
    questionsAsked: Number,
    questionsAnswered: Number
});

userSchema.plugin(passportLocalMongoose);

const answerSchema = new mongoose.Schema({
    answeredById: String,
    answeredByName: String,
    answer: String,
    upvotes: [String], // array of user ids who have upvoted
    downvotes: [String],
    votes: Number,
    date: String
});

const questionSchema = new mongoose.Schema({
    askedById: String,
    askedByName: String,
    question: String,
    answers: [answerSchema],
    date: String
});

const collegeSchema = new mongoose.Schema({
    name: String,
    questions: [questionSchema]
});

const Answer = mongoose.model("Answer", answerSchema);
const Question = mongoose.model("Question", questionSchema);
const User = mongoose.model("User", userSchema);
passport.use(User.createStrategy());
const College = mongoose.model("College", collegeSchema);

passport.serializeUser(function(user, done) { // serialize - set up the session cookie and stuff user data onto the cookie
    done(null, user.id);
});
  
passport.deserializeUser(function(id, done) { // deserialize - crumble the cookie and get user data back for authentication
    User.findById(id, function(err, user) {
        done(err, user);
    });
});

app.get("/", (req, res) => {
    if (req.user)
        res.render("home", {currYear: new Date().getFullYear(), username: req.user.name});
    else
        res.render("home", {currYear: new Date().getFullYear(), username: ""});
});


app.route("/login")
.get(function (req, res) {
    if (req.user)
        res.render("login", {currYear: new Date().getFullYear(), username: req.user.name});
    else
        res.render("login", {currYear: new Date().getFullYear(), username: ""});
})
.post(passport.authenticate("local"), function (req, res) {
    res.redirect("/questions");
});


app.route("/register")
.get(function (req, res) { // register get request on port /register
    if (req.user)
        res.render("register", {currYear: new Date().getFullYear(), username: req.user.name});
    else 
        res.render("register", {currYear: new Date().getFullYear(), username: ""});
})
.post(function (req, res) { // normal user registration (other than Sign up with google)

    ////////////////////////////////////// IMP //////////////////////////////////
    /*
    If we have more than 2 fields (namely username and password) in our userSchema then we can initialise them
    in the object in the first argument to User.register()
    eg User.register({username: req.body.username, email:req.body.email}, req.body.password, function (err, user) {..})
    */

    User.register({username: req.body.username, college: req.body.college, questionsAsked: 0, questionsAnswered: 0, name: req.body.name}, req.body.password, function(err, user) { // register the user with email and password
        if (err) { // redirect to /register if there is an error
            res.send(err);
        } else {
            passport.authenticate("local")(req, res, function() {
                // this callback is only executed if the user is authenticated and a session cookie has been successfully set for the user

                College.findOne( // if college entered by user is not present in database then add it
                    {name: req.body.college},
                    function (err, college) {
                        if (err)
                            console.log(err);
                        else {
                            if (!college) { // if college doesn't exists
                                const newCollege = new College({
                                    name: req.body.college,
                                    questions: []
                                });
                                newCollege.save();
                                res.redirect("/questions");
                            } else {
                                res.redirect("/questions");
                            }
                        }
                    }
                );
            });
        }
    });
});

app.get("/questions", function (req, res) {
    if (req.isAuthenticated()) {
        College.findOne(
            {name: req.user.college},
            function (err, college) {
                if (err)
                    console.log(err);
                else {
                    if (college) {
                        res.render("questions", {currYear: new Date().getFullYear(), username: req.user.name, questions: college.questions});
                    } //else {
                       // console.log("I am here\n");
                    //}
                }
            }
        );
    } else 
        res.redirect("/login");
});

app.route("/questions/:questionId")
.get(function (req, res) {
    if (req.isAuthenticated()) {
        College.findOne(
            {name: req.user.college},
            function (err, college) {
                if (err)
                    console.log(err);
                else {
                    if (college) {
                        let i;
                        for (i = 0; i < college.questions.length; i++)
                            if (college.questions[i]._id == req.params.questionId)
                                break;
                        if (i === college.questions.length)
                            res.redirect("/questions");
                        else {
                            college.questions[i].answers.sort(function (answer1, answer2) {
                                if (answer1.votes > answer2.votes)
                                    return -1;
                                else
                                    return 1;
                            });
                            res.render("question", {currYear: new Date().getFullYear(), question: college.questions[i], username: req.user.name});

                        }
                    } else {
                        res.redirect("/questions");
                    }
                }
            }
        );
    } else {
        res.redirect("/login");
    }
})
.post(function (req, res) {
    let newAnswer;
    const date = new Date();
    if (req.body.nonAnonymous) {
        newAnswer = new Answer({
            answeredById: req.user._id,
            answeredByName: req.user.name,
            answer: req.body.answer,
            upvotes: [],
            downvotes: [],
            votes: 0,
            date: date.getDate() + "." + (date.getMonth() + 1) + "." + date.getFullYear()
        });
        User.findOne(
            {_id: req.user._id},
            function (err, user) {
                if (err)
                    console.log(err);
                else {
                    user.questionsAnswered++;
                    user.save();
                }
            }
        );
    } else {
        newAnswer = new Answer({
            answeredById: "",
            answeredByName: "anonymous",
            answer: req.body.answer,
            upvotes: [],
            downvotes: [],
            votes: 0,
            date: date.getDate() + "." + (date.getMonth() + 1) + "." + date.getFullYear()
        });
    }  

    College.findOne(
        {name: req.user.college},
        function (err, college) {
            if (err)
                console.log(err);
            else {
                let i;
                for (i = 0; i < college.questions.length; i++)
                    if (college.questions[i]._id == req.params.questionId)
                        break;
                if (i === college.questions.length)
                    res.send("Invalid question id");
                else {
                    college.questions[i].answers.splice(0, 0, newAnswer);
                    college.save();
                    res.redirect("/questions/" + req.params.questionId);
                }
                
            }
        }
    );
});

app.post("/upvotes/:questionId/:answerId", function (req, res) {
    College.findOne(
        {name: req.user.college},
        function (err, college) {
            if (err)
                console.log(err);
            else {
                let i, j;
                for (i = 0; i < college.questions.length; i++)
                    if (college.questions[i]._id == req.params.questionId)
                        break;
                if (i === college.questions.length)
                    res.send("Invalid question id");
                else {
                    for (j = 0; j < college.questions[i].answers.length; j++)
                        if (college.questions[i].answers[j]._id == req.params.answerId)
                            break;
                    if (j === college.questions[i].answers.length)
                        res.send("Invalid question id");
                    else {
                        if (!college.questions[i].answers[j].upvotes.find((userId) => userId == req.user._id)) {
                            college.questions[i].answers[j].upvotes.push(req.user._id);
                            college.questions[i].answers[j].votes++;
                        }
                        college.save();
                        res.redirect("/questions/" + req.params.questionId);
                    }
                }
                
            }
        }
    );
});

app.post("/downvotes/:questionId/:answerId", function (req, res) {
    College.findOne(
        {name: req.user.college},
        function (err, college) {
            if (err)
                console.log(err);
            else {
                let i, j;
                for (i = 0; i < college.questions.length; i++)
                    if (college.questions[i]._id == req.params.questionId)
                        break;
                if (i === college.questions.length)
                    res.send("Invalid question id");
                else {
                    for (j = 0; j < college.questions[i].answers.length; j++)
                        if (college.questions[i].answers[j]._id == req.params.answerId)
                            break;
                    if (j === college.questions[i].answers.length)
                        res.send("Invalid question id");
                    else {
                        if (!college.questions[i].answers[j].downvotes.find((userId) => userId == req.user._id)) {
                            college.questions[i].answers[j].downvotes.push(req.user._id);
                            college.questions[i].answers[j].votes--;
                        }
                        college.save();
                        res.redirect("/questions/" + req.params.questionId);
                    }
                }
                
            }
        }
    );
});

app.route("/ask-question")
.get(function (req, res) {
    if (req.isAuthenticated())
        res.render("askQuestion", {currYear: new Date().getFullYear(), username: req.user.name});
    else
        res.redirect("/login");
})
.post(function (req, res) {
    let newQuestion;
    let date = new Date();
    if (req.body.anonymous) {
        newQuestion = new Question({
            askedById: "",
            askedByName: "anonymous",
            question: req.body.question,
            answers: [],
            date: date.getDate() + "." + (date.getMonth() + 1) + "." + date.getFullYear()
        });
    } else {
        newQuestion = new Question({
            askedById: req.user._id,
            askedByName: req.user.name,
            question: req.body.question,
            answers: [],
            date: date.getDate() + "." + (date.getMonth() + 1) + "." + date.getFullYear()
        });
        User.findOne(
            {_id: req.user._id},
            function (err, user) {
                if (err)
                    console.log(err);
                else {
                    user.questionsAsked++;
                    user.save();
                }
            }
        );
    }
    
    College.findOneAndUpdate(
        {name: req.user.college},
        {$push: {questions: {$each: [newQuestion], $position: 0}}}, // push in the beginning of the array
        function (err, user) {
            if (err)
                console.log(err);
            else
                res.redirect("/questions");
        } 
    );
});

app.get("/profile", function (req, res) {
    if (req.isAuthenticated()) {
        res.render("profile", {currYear: new Date().getFullYear(), username: req.user.name, user: req.user});
    } else 
        res.redirect("/login");
});

app.get("/logout", function (req, res) {
    req.logout();
    res.redirect("/");
});

app.listen(process.env.PORT, () => console.log("Server started on port " + process.env.PORT));

/*College.findOne(
    // $sort and -1 are with descending order
    {"questions._id": "60feaaa47570087258dfce30"},
    function (err, ans) {
        if (err)
            console.log(err);
        else {
            //ans.questions[0].question = "a 3";
            //ans.save()
            console.log(ans);
        }
    }
);*/
