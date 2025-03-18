require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static('public'));

const uri = process.env.MONGODB_URI;
let db;

// Email Transporter Configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'sakethgoljana098@gmail.com',
        pass: 'taaaoojppsljbjps' // Note: This should be an App Password for Gmail, not the raw password
    }
});

// MongoDB Connection
(async () => {
    try {
        const client = await MongoClient.connect(uri, { useUnifiedTopology: true });
        db = client.db('leadsDB');
        console.log('Connected to MongoDB - Elite Lounge System Online');
        startNotificationScheduler(); // Start notifications after connection
    } catch (err) {
        console.error('MongoDB Connection Failed:', err);
        process.exit(1);
    }
})();

// Scoring Logic
const calculateVisitorScore = (visitor) => {
    let score = 0;
    score += visitor.visitCount * 15;
    score += Math.floor(visitor.totalSpent / 5);
    const accessMethodPoints = {
        'Membership': 75, 'Referral': 60, 'Online Booking': 50, 'Event Pass': 70,
        'Walk-in': 30, 'Social Media Offer': 55, 'Email Promotion': 40, 'Phone Booking': 25,
        'Partner Voucher': 65, 'Advertisement': 45, 'Trade Show Pass': 70, 'Cold Outreach': 20,
        'Live Chat Booking': 40, 'Kiosk Check-in': 35, 'Loyalty Reward': 80
    };
    score += accessMethodPoints[visitor.accessMethod] || 0;
    score += visitor.timeExtensions * 25;
    score += visitor.paymentInitiations * 10;
    return Math.min(Math.round(score), 1500);
};

// Email Sending Function
const sendEmail = async (to, subject, message) => {
    try {
        const mailOptions = {
            from: 'sakethgoljana098@gmail.com',
            to,
            subject,
            text: message
        };
        await transporter.sendMail(mailOptions);
        console.log(`[Email Sent] To: ${to}, Subject: ${subject}`);
    } catch (err) {
        console.error(`[Email Error] To: ${to}, Subject: ${subject}, Error: ${err.message}`);
    }
};

// Notification Scheduler
const startNotificationScheduler = () => {
    const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds
    // For testing: const ONE_HOUR = 10 * 1000; // 10 seconds

    setInterval(async () => {
        try {
            const highValueVisitors = await db.collection('visitors')
                .find({ visitorScore: { $gt: 50 } })
                .toArray();

            if (highValueVisitors.length > 0) {
                console.log(`[${new Date().toISOString()}] Sending notifications to ${highValueVisitors.length} high-value visitors`);
                for (const visitor of highValueVisitors) {
                    await sendEmail(
                        visitor.email,
                        'Elite Lounge High-Value Visitor Update',
                        `Dear ${visitor.name}, your Elite Lounge score is ${visitor.visitorScore}! Enjoy exclusive offers on your next visit.`
                    );
                }
            } else {
                console.log(`[${new Date().toISOString()}] No visitors with score > 50 found`);
            }
        } catch (err) {
            console.error('Notification Scheduler Error:', err);
        }
    }, ONE_HOUR);
};

// Check-In
app.post('/api/checkin', async (req, res) => {
    try {
        const { name, email, phone, accessMethod, visitDate } = req.body;
        if (!name || !email || !phone || !accessMethod || !visitDate) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const existingVisitor = await db.collection('visitors').findOne({ email });
        const currentTime = new Date();
        const checkInTime = new Date(visitDate);

        let visitor;
        if (existingVisitor) {
            visitor = {
                ...existingVisitor,
                visitCount: existingVisitor.visitCount + 1,
                accessMethod,
                checkInTime,
                loungeTime: 2,
                status: 'active',
                lastVisit: currentTime,
                timeExtensions: existingVisitor.timeExtensions || 0,
                paymentInitiations: existingVisitor.paymentInitiations || 0
            };
            visitor.visitorScore = calculateVisitorScore(visitor);
            await db.collection('visitors').updateOne(
                { _id: existingVisitor._id },
                { $set: visitor }
            );
        } else {
            visitor = {
                name, email, phone, accessMethod,
                visitCount: 1, totalSpent: 0, loungeTime: 2,
                checkInTime, lastVisit: currentTime, status: 'active',
                timeExtensions: 0, paymentInitiations: 0, visitorScore: 0
            };
            visitor.visitorScore = calculateVisitorScore(visitor);
            await db.collection('visitors').insertOne(visitor);
        }

        setTimeout(async () => {
            await db.collection('visitors').updateOne(
                { email },
                { $set: { status: 'expired', loungeTime: 0 } }
            );
            await sendEmail(
                email,
                'Elite Lounge Access Ended',
                'Your lounge access has ended. Visit again soon!'
            );
        }, 120 * 1000);

        res.json({ success: true, message: 'Welcome to Elite Lounge!', visitorId: visitor._id.toString() });
    } catch (err) {
        console.error('Check-In Error:', err);
        res.status(500).json({ success: false, message: 'Server error during check-in' });
    }
});

// Extend Time
app.post('/api/visitors/:id/extend', async (req, res) => {
    try {
        const { id } = req.params;
        const visitor = await db.collection('visitors').findOne({ _id: new ObjectId(id) });
        if (!visitor || visitor.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Invalid or expired visitor' });
        }

        const updatedVisitor = {
            ...visitor,
            loungeTime: visitor.loungeTime + 1,
            timeExtensions: (visitor.timeExtensions || 0) + 1
        };
        updatedVisitor.visitorScore = calculateVisitorScore(updatedVisitor);

        await db.collection('visitors').updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedVisitor }
        );

        res.json({ success: true, message: 'Time extension requested. Please complete payment.' });
    } catch (err) {
        console.error('Extend Time Error:', err);
        res.status(500).json({ success: false, message: 'Server error during time extension' });
    }
});

// Initiate Payment
app.post('/api/visitors/:id/initiate-payment', async (req, res) => {
    try {
        const { id } = req.params;
        const visitor = await db.collection('visitors').findOne({ _id: new ObjectId(id) });
        if (!visitor || visitor.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Invalid or expired visitor' });
        }

        const updatedVisitor = {
            ...visitor,
            paymentInitiations: (visitor.paymentInitiations || 0) + 1,
            totalSpent: visitor.totalSpent + 10
        };
        updatedVisitor.visitorScore = calculateVisitorScore(updatedVisitor);

        await db.collection('visitors').updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedVisitor }
        );

        res.json({ success: true, message: 'Payment initiated successfully!' });
    } catch (err) {
        console.error('Payment Initiation Error:', err);
        res.status(500).json({ success: false, message: 'Server error during payment initiation' });
    }
});

app.listen(port, () => {
    console.log(`Elite Lounge Management System Running on Port ${port}`);
});